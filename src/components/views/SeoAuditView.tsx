import React, { useEffect, useState } from 'react';
import { Activity, Sparkles } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { AuditReportRow } from '../../types/seo';

export const SeoAuditView: React.FC = () => {
  const [audits, setAudits] = useState<AuditReportRow[]>([]);
  const [selected, setSelected] = useState<AuditReportRow | null>(null);
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [comparisonWindow, setComparisonWindow] = useState('previous_month');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAudits = async () => {
    try {
      const res = await apiFetch('/api/audits');
      const list: AuditReportRow[] = res.audits || [];
      setAudits(list);
      if (list.length > 0 && !selected) setSelected(list[0]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadAudits();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch('/api/audits/generate', {
        method: 'POST',
        body: JSON.stringify({ reportMonth, comparisonWindow }),
      });
      setSelected(res.report);
      await loadAudits();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const s = selected?.sectionsJson || {};

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E6E0D6] pb-5">
        <h1 className="font-display text-3xl font-bold text-[#1D221F]">
          Monthly SEO Audit Engine (19 Sections)
        </h1>
        <p className="mt-1 text-xs text-[#5C635E]">
          Compiles Search Console performance, keyword movements, indexing coverage, internal &amp; broken link checks, image audits, cannibalization, and next month&apos;s content plan.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs">
          {error}
        </div>
      )}

      <form
        onSubmit={handleGenerate}
        className="bg-white border border-[#E6E0D6] rounded-lg p-5 flex flex-wrap items-end gap-4 text-xs"
      >
        <div>
          <label className="block font-medium text-[#1D221F] mb-1">Audit Month</label>
          <input
            type="month"
            value={reportMonth}
            onChange={(e) => setReportMonth(e.target.value)}
            className="px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular"
          />
        </div>
        <div>
          <label className="block font-medium text-[#1D221F] mb-1">Comparison Period</label>
          <select
            value={comparisonWindow}
            onChange={(e) => setComparisonWindow(e.target.value)}
            className="px-3 py-2 rounded-md border border-[#E6E0D6]"
          >
            <option value="current_month">Current Month</option>
            <option value="previous_month">Previous Month</option>
            <option value="last_3_months">Last 3 Months</option>
            <option value="last_6_months">Last 6 Months</option>
            <option value="year_over_year">Year over Year (If Data Exists)</option>
          </select>
        </div>
        {audits.length > 0 && (
          <div className="flex-1 min-w-[200px]">
            <label className="block font-medium text-[#1D221F] mb-1">Saved Audits</label>
            <select
              value={selected?.id || ''}
              onChange={(e) => {
                const found = audits.find((a) => a.id === Number(e.target.value));
                if (found) setSelected(found);
              }}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
            >
              {audits.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.reportMonth} ({a.comparisonWindow}) — Generated {new Date(a.generatedAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="submit"
          disabled={generating}
          className="px-5 py-2 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium hover:bg-[#143325] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{generating ? 'Compiling 19-Section Audit...' : 'Generate Monthly SEO Audit'}</span>
        </button>
      </form>

      {selected ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
          <div className="lg:col-span-2 bg-white border border-[#E6E0D6] rounded-lg p-6">
            <h2 className="font-display text-xl font-bold text-[#1D221F] mb-2">
              01. Executive Summary ({selected.reportMonth})
            </h2>
            <p className="text-sm text-[#2B332E] leading-relaxed">{selected.executiveSummary}</p>
          </div>

          <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-2">
            <h3 className="font-display text-lg font-bold text-[#1D221F]">
              02–05. Organic Performance, CTR &amp; Position
            </h3>
            {typeof s.organicPerformance === 'object' ? (
              <div className="space-y-1.5 font-mono-tabular">
                <div>Total Clicks: {s.organicPerformance.clicks}</div>
                <div>Total Impressions: {s.organicPerformance.impressions}</div>
                <div>Average CTR: {s.averageCtr}%</div>
                <div>Average Position: {s.averagePosition} (GSC Historical Avg)</div>
                <div>Date Window: {s.organicPerformance.dateRange}</div>
              </div>
            ) : (
              <p className="text-[#5C635E]">{String(s.organicPerformance || 'Unavailable until Search Console sync.')}</p>
            )}
          </div>

          <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-2">
            <h3 className="font-display text-lg font-bold text-[#1D221F]">
              06–08. Keyword Performance, New &amp; Declining Queries
            </h3>
            <div className="font-mono-tabular space-y-1">
              <div>Tracked Queries in Window: {(s.keywordPerformance || []).length}</div>
              <div className="text-[#16A34A]">New Ranking Keywords: {(s.newRankingKeywords || []).length}</div>
              <div className="text-[#DC2626]">Lost / Declining Keywords: {(s.lostAndDecliningKeywords || []).length}</div>
            </div>
          </div>

          <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-2">
            <h3 className="font-display text-lg font-bold text-[#1D221F]">
              09–12. Blog Performance, Indexing &amp; Page Coverage
            </h3>
            <div className="font-mono-tabular space-y-1">
              <div>Top Performing Pages: {(s.topPerformingBlogs || []).length}</div>
              <div>Low-Score Drafts (&lt;75): {(s.lowPerformingBlogs || []).length}</div>
              <div className="text-[#16A34A]">Indexed URLs: {s.indexingStatus?.indexed ?? 0}</div>
              <div className="text-[#D97706]">Not Indexed URLs: {s.indexingStatus?.notIndexed ?? 0}</div>
            </div>
          </div>

          <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-2">
            <h3 className="font-display text-lg font-bold text-[#1D221F]">
              13–17. Internal Links, Broken Links, Images, Warnings &amp; Cannibalization
            </h3>
            <div className="font-mono-tabular space-y-1">
              <div>Internal Links Cataloged: {s.internalLinkingAudit?.totalLinks ?? 0}</div>
              <div className="text-[#DC2626]">Broken Links Detected: {(s.brokenLinkAudit || []).length}</div>
              <div>WebP Images: {s.imageOptimizationAudit?.webpCount ?? 0} / {s.imageOptimizationAudit?.totalImages ?? 0}</div>
              <div>Cannibalization Warnings: {(s.contentCannibalization || []).length}</div>
            </div>
            {(s.technicalSeoWarnings || []).map((w: string, i: number) => (
              <div key={i} className="text-[#B45309] pt-1">
                · {w}
              </div>
            ))}
          </div>

          <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-2">
            <h3 className="font-display text-lg font-bold text-[#1D221F]">
              18. Next Month&apos;s Content Plan
            </h3>
            <div className="space-y-2">
              {(s.nextMonthContentPlan || []).map((p: any, idx: number) => (
                <div key={idx} className="pb-2 border-b border-[#F0ECE4] last:border-b-0">
                  <div className="font-semibold text-[#1D221F]">{p.title}</div>
                  <div className="text-[11px] text-[#5C635E]">
                    Keyword: {p.targetKeyword} · {p.category} · Priority: {p.priority}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-2">
            <h3 className="font-display text-lg font-bold text-[#1D221F]">
              19. Recommended Technical &amp; Editorial Improvements
            </h3>
            <div className="space-y-2">
              {(s.recommendedImprovements || []).map((imp: any, idx: number) => (
                <div key={idx} className="pb-2 border-b border-[#F0ECE4] last:border-b-0">
                  <div className="font-semibold text-[#1B4332]">
                    {imp.area} ({imp.impact} Impact)
                  </div>
                  <div className="text-[#49504B] mt-0.5">{imp.recommendation}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#E6E0D6] rounded-lg p-12 text-center text-xs text-[#5C635E]">
          <Activity className="w-6 h-6 mx-auto mb-2 text-[#1B4332]" />
          <p>Click &ldquo;Generate Monthly SEO Audit&rdquo; above to compile your 19-section report.</p>
        </div>
      )}
    </div>
  );
};
