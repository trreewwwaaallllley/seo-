import React, { useEffect, useState } from 'react';
import { Layers, Pause, Play, CheckSquare, CalendarClock, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { LANGUAGES_350 } from '../../data/languages';
import { Article, BulkJob } from '../../types/seo';

const BATCH_PRESETS = [1, 5, 10, 20, 50, 100, 300];

export const BulkGeneratorView: React.FC = () => {
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [batchName, setBatchName] = useState('Sheesham Bedroom & Living Expansion');
  const [requestedCount, setRequestedCount] = useState(5);
  const [category, setCategory] = useState('Wooden beds');
  const [languageCode, setLanguageCode] = useState('en-IN');
  const [mode, setMode] = useState('SEO Buying Guide');
  const [writingStyle, setWritingStyle] = useState('Premium editorial');
  const [concurrency, setConcurrency] = useState(3);
  const [seedTopics, setSeedTopics] = useState(
    'Best Solid Sheesham Wood King Size Beds for Indian Apartments\nStorage Beds vs Hydraulic Beds: Indian Climate Timber Guide\nHow to Maintain Rosewood & Sheesham Almaris During Monsoon\nModular vs Solid Wood Wardrobes: Long-Term Value Comparison\nChoosing a Solid Wood Coffee Table for Compact Living Rooms'
  );
  const [selectedArticleIds, setSelectedArticleIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [jRes, aRes] = await Promise.all([
        apiFetch('/api/bulk-jobs'),
        apiFetch('/api/articles'),
      ]);
      setJobs(jRes.jobs || []);
      setArticles(aRes.articles || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(() => {
      loadData();
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const handleStartBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch('/api/bulk-jobs', {
        method: 'POST',
        body: JSON.stringify({
          batchName,
          requestedCount,
          category,
          languageCode,
          mode,
          writingStyle,
          concurrency,
          seedTopics,
        }),
      });
      setNotice(
        `Queued "${res.job.batchName}" (${res.job.requestedCount} draft jobs). All outputs save strictly as drafts pending quality gate review.`
      );
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePauseResume = async (job: BulkJob) => {
    try {
      const endpoint = job.status === 'running' ? 'pause' : 'resume';
      await apiFetch(`/api/bulk-jobs/${job.id}/${endpoint}`, { method: 'POST' });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleBatchAction = async (action: 'draft' | 'approve' | 'schedule') => {
    if (selectedArticleIds.length === 0) return;
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch('/api/bulk-jobs/batch-action', {
        method: 'POST',
        body: JSON.stringify({
          articleIds: selectedArticleIds,
          action,
          scheduledStartIso: new Date(Date.now() + 86400000).toISOString(),
        }),
      });
      const skippedMsg =
        res.skipped?.length > 0
          ? ` (${res.skipped.length} held back by SEO quality or cannibalization gate)`
          : '';
      setNotice(`Updated ${res.updated.length} article(s) to ${action}${skippedMsg}.`);
      setSelectedArticleIds([]);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const bulkDrafts = articles.filter((a) => a.bulkJobId !== null || a.status === 'draft');

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E6E0D6] pb-5">
        <h1 className="font-display text-3xl font-bold text-[#1D221F]">
          Bulk Blog Generation Queue
        </h1>
        <p className="mt-1 text-xs text-[#5C635E]">
          Supports 1 to 300 parallel draft generation jobs (aspirational throughput target subject to API limits; displays measured real speed). Every draft passes duplicate, cannibalization, and SEO validation before approval—never auto-published.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-md border border-[#16A34A]/30 bg-[#F0FDF4] text-[#166534] text-xs">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleStartBatch}
          className="lg:col-span-5 bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4 text-xs"
        >
          <h2 className="font-display text-xl font-bold text-[#1D221F]">
            Configure Bulk Draft Batch
          </h2>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1">Batch Name</label>
            <input
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1.5">
              Requested Draft Count (1 – 300)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {BATCH_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRequestedCount(n)}
                  className={`px-3 py-1.5 rounded-md border font-mono-tabular cursor-pointer ${
                    requestedCount === n
                      ? 'bg-[#1B4332] text-[#FAF8F4] border-[#1B4332]'
                      : 'bg-white text-[#49504B] border-[#E6E0D6]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Furniture Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
              >
                <option value="Wooden beds">Wooden beds</option>
                <option value="King size beds">King size beds</option>
                <option value="Queen size beds">Queen size beds</option>
                <option value="Wooden wardrobes">Wooden wardrobes</option>
                <option value="Wooden almari">Wooden almari</option>
                <option value="Coffee tables">Coffee tables</option>
                <option value="Cabinets">Cabinets</option>
                <option value="Dining tables">Dining tables</option>
                <option value="TV units">TV units</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Language</label>
              <select
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
              >
                {LANGUAGES_350.slice(0, 60).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
              >
                <option value="SEO Buying Guide">SEO Buying Guide</option>
                <option value="Furniture Magazine Article">Furniture Magazine Article</option>
                <option value="Product Category Article">Product Category Article</option>
                <option value="Furniture Care Guide">Furniture Care Guide</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">
                Parallel Workers (1–5)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Seed Topics (one per line)
            </label>
            <textarea
              rows={5}
              value={seedTopics}
              onChange={(e) => setSeedTopics(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium hover:bg-[#143325] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            <span>{submitting ? 'Starting Queue...' : `Queue ${requestedCount} Draft Jobs`}</span>
          </button>
        </form>

        {/* Active & Historical Jobs */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
            <h2 className="font-display text-xl font-bold text-[#1D221F] mb-3">
              Background Worker Queue
            </h2>
            {jobs.length === 0 ? (
              <p className="text-xs text-[#5C635E] py-6">
                No bulk jobs queued yet. Configure a batch on the left to start parallel draft generation.
              </p>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => {
                  const pct = Math.round(
                    ((job.completedCount + job.failedCount) / Math.max(1, job.requestedCount)) * 100
                  );
                  return (
                    <div key={job.id} className="p-4 border border-[#E6E0D6] rounded-md space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#1D221F]">{job.batchName}</div>
                          <div className="text-[11px] text-[#5C635E]">
                            {job.languageName} · {job.mode} · Workers: {job.concurrency}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular text-[#1B4332] font-medium">
                            {job.status} · {job.throughputPerMin} drafts/min measured
                          </span>
                          {(job.status === 'running' || job.status === 'paused') && (
                            <button
                              type="button"
                              onClick={() => handlePauseResume(job)}
                              className="px-2.5 py-1 rounded border border-[#E6E0D6] hover:bg-[#FAF8F4] flex items-center gap-1 cursor-pointer"
                            >
                              {job.status === 'running' ? (
                                <>
                                  <Pause className="w-3 h-3" />
                                  <span>Pause</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3" />
                                  <span>Resume</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="w-full h-2 bg-[#EFECE5] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#1B4332] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-[11px] font-mono-tabular text-[#5C635E]">
                        <span>
                          Completed: {job.completedCount} / {job.requestedCount} · Failed: {job.failedCount}
                        </span>
                        <span>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quality Gate & Batch Approval Table */}
          <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold text-[#1D221F]">
                Draft Review &amp; Quality Gate ({selectedArticleIds.length} selected)
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleBatchAction('approve')}
                  disabled={selectedArticleIds.length === 0}
                  className="px-3 py-1.5 text-xs rounded-md bg-[#1B4332] text-[#FAF8F4] disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Approve Selected</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchAction('schedule')}
                  disabled={selectedArticleIds.length === 0}
                  className="px-3 py-1.5 text-xs rounded-md border border-[#1B4332] text-[#1B4332] disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  <span>Schedule Approved</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E6E0D6] text-[#5C635E]">
                    <th className="py-2 pr-2 text-left">Sel</th>
                    <th className="py-2 pr-3 text-left font-medium">Article Title</th>
                    <th className="py-2 px-2 text-left font-medium">Language</th>
                    <th className="py-2 px-2 text-right font-medium">SEO Score</th>
                    <th className="py-2 px-2 text-right font-medium">Dup %</th>
                    <th className="py-2 pl-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkDrafts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[#5C635E]">
                        Generated drafts will appear here for mandatory review.
                      </td>
                    </tr>
                  ) : (
                    bulkDrafts.slice(0, 30).map((a) => (
                      <tr key={a.id} className="border-b border-[#F0ECE4] hover:bg-[#FAF8F4]">
                        <td className="py-2.5 pr-2">
                          <input
                            type="checkbox"
                            checked={selectedArticleIds.includes(a.id)}
                            onChange={(e) =>
                              setSelectedArticleIds((prev) =>
                                e.target.checked
                                  ? [...prev, a.id]
                                  : prev.filter((id) => id !== a.id)
                              )
                            }
                            className="accent-[#1B4332]"
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-[#1D221F]">{a.title}</div>
                          {a.cannibalizationWarning && (
                            <div className="text-[11px] text-[#D97706]">
                              {a.cannibalizationWarning}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-[#49504B]">{a.languageName}</td>
                        <td className="py-2.5 px-2 text-right font-mono-tabular font-semibold">
                          {a.seoScore}/100
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono-tabular">
                          {a.duplicateScore}%
                        </td>
                        <td className="py-2.5 pl-2 capitalize text-[#1B4332]">{a.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
