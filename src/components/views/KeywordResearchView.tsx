import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, GitCompare, PenLine, Search, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { exportKeywordsCsv, exportKeywordsXlsx } from '../../lib/exporters';
import { KeywordRow } from '../../types/seo';

interface KeywordResearchViewProps {
  onCreateBlog: (topic: string, keyword: string) => void;
}

export const KeywordResearchView: React.FC<KeywordResearchViewProps> = ({ onCreateBlog }) => {
  const [keywordsList, setKeywordsList] = useState<KeywordRow[]>([]);
  const [seed, setSeed] = useState('');
  const [searchType, setSearchType] = useState('keyword');
  const [country, setCountry] = useState('India');
  const [region, setRegion] = useState('All India');
  const [language, setLanguage] = useState('English');
  const [listName, setListName] = useState('Sheesham Beds & Storage');
  const [filterList, setFilterList] = useState('All');
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadKeywords = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/keywords');
      setKeywordsList(data.keywords || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeywords();
  }, []);

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seed.trim()) return;
    setSearching(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await apiFetch('/api/keywords/research', {
        method: 'POST',
        body: JSON.stringify({ seed, searchType, country, region, language, listName }),
      });
      setStatusMsg(
        `Discovered ${res.keywords?.length || 0} keywords · Ads API Status: ${res.adsApiStatus}`
      );
      setSeed('');
      await loadKeywords();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/keywords/${id}`, { method: 'DELETE' });
      setKeywordsList((prev) => prev.filter((k) => k.id !== id));
      setCompareIds((prev) => prev.filter((cid) => cid !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleCompare = (id: number) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const lists = ['All', ...Array.from(new Set(keywordsList.map((k) => k.listName || 'General')))];
  const filtered =
    filterList === 'All'
      ? keywordsList
      : keywordsList.filter((k) => (k.listName || 'General') === filterList);

  const comparedRows = keywordsList.filter((k) => compareIds.includes(k.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E6E0D6] pb-5">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#1D221F]">
            Google Keyword Research Engine
          </h1>
          <p className="mt-1 text-xs text-[#5C635E]">
            Strictly separates Google Ads Planner volumes, Google Trends interest, and Search Console actual clicks/impressions. Competition is never labeled low without Google data.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => exportKeywordsCsv(filtered)}
            disabled={filtered.length === 0}
            className="px-3 py-2 text-xs font-medium rounded-md border border-[#E6E0D6] bg-white hover:bg-[#FAF8F4] disabled:opacity-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={() => exportKeywordsXlsx(filtered)}
            disabled={filtered.length === 0}
            className="px-3 py-2 text-xs font-medium rounded-md bg-[#1B4332] text-[#FAF8F4] hover:bg-[#143325] disabled:opacity-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Research Input Bar */}
      <form
        onSubmit={handleResearch}
        className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4 text-xs"
      >
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <label className="block font-medium text-[#1D221F] mb-1">
              Seed Input (Keyword, Product, Domain, URL, or Multi-seed)
            </label>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="e.g. sheesham wood king bed with box storage"
              required
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] focus:outline-none focus:border-[#1B4332]"
            />
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">Input Type</label>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
            >
              <option value="keyword">Keyword</option>
              <option value="product">Product Name</option>
              <option value="competitor">Competitor Domain</option>
              <option value="url">Website URL</option>
              <option value="category">Furniture Category</option>
              <option value="multi-seed">Multiple Seeds</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">Country &amp; State/City</label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="India / Bengaluru / Mumbai"
              className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
            />
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
            >
              <option value="English">English (India)</option>
              <option value="Hindi">Hindi</option>
              <option value="Marathi">Marathi</option>
              <option value="Tamil">Tamil</option>
              <option value="Telugu">Telugu</option>
              <option value="Kannada">Kannada</option>
              <option value="Bengali">Bengali</option>
              <option value="Gujarati">Gujarati</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">Keyword List</label>
            <input
              type="text"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-[#5C635E]">
            Network: Google Search · Target: {country} ({region})
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-5 py-2 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium hover:bg-[#143325] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{searching ? 'Analyzing Opportunities...' : 'Research Keywords'}</span>
          </button>
        </div>
      </form>

      {statusMsg && (
        <div className="p-3.5 rounded-md border border-[#1B4332]/30 bg-[#F3F8F5] text-[#1B4332] text-xs">
          {statusMsg}
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs">
          {error}
        </div>
      )}

      {/* Side-by-side Keyword Comparison Panel */}
      {comparedRows.length > 0 && (
        <div className="bg-white border border-[#B68D40]/50 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-bold text-[#1D221F] flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-[#B68D40]" />
              <span>Keyword Comparison ({comparedRows.length}/4)</span>
            </h2>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="text-xs text-[#5C635E] hover:underline cursor-pointer"
            >
              Clear comparison
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {comparedRows.map((row) => (
              <div key={row.id} className="p-3.5 border border-[#E6E0D6] rounded-md bg-[#FAF8F4]">
                <div className="font-semibold text-[#1D221F] mb-2">{row.keyword}</div>
                <div className="space-y-1 text-[#49504B]">
                  <div>Ads Volume: <span className="font-mono-tabular">{row.adsAvgMonthlySearches ?? 'Unconnected'}</span></div>
                  <div>Ads Competition: <span className="font-mono-tabular">{row.adsCompetitionLevel ?? 'Unverified'}</span></div>
                  <div>Trends Score: <span className="font-mono-tabular">{row.trendsInterestScore ?? 'Not imported'}</span></div>
                  <div>GSC Clicks / Impr: <span className="font-mono-tabular">{row.gscClicks ?? '—'} / {row.gscImpressions ?? '—'}</span></div>
                  <div>GSC Avg Pos: <span className="font-mono-tabular">{row.gscAvgPosition ?? '—'}</span></div>
                  <div>Opportunity Score: <span className="font-mono-tabular font-semibold">{row.opportunityScore}/100</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List Filter & Keywords Table */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap gap-1.5">
            {lists.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setFilterList(l)}
                className={`px-3 py-1 text-xs rounded-md border cursor-pointer ${
                  filterList === l
                    ? 'bg-[#1B4332] text-white border-[#1B4332]'
                    : 'bg-white text-[#49504B] border-[#E6E0D6]'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="text-xs text-[#5C635E] font-mono-tabular">
            {filtered.length} saved keyword(s)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E6E0D6] text-[#5C635E]">
                <th className="text-left py-2.5 pr-2 font-medium">Cmp</th>
                <th className="text-left py-2.5 pr-3 font-medium">Keyword &amp; Long-Tail</th>
                <th className="text-right py-2.5 px-2 font-medium">Ads Vol.</th>
                <th className="text-left py-2.5 px-2 font-medium">Ads Comp.</th>
                <th className="text-right py-2.5 px-2 font-medium">Trends</th>
                <th className="text-right py-2.5 px-2 font-medium">GSC Clicks / Impr</th>
                <th className="text-right py-2.5 px-2 font-medium">GSC Pos</th>
                <th className="text-left py-2.5 px-2 font-medium">Intent</th>
                <th className="text-right py-2.5 px-2 font-medium">Opp.</th>
                <th className="text-right py-2.5 pl-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-[#5C635E]">
                    Loading keyword database...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-[#5C635E]">
                    No keywords researched yet. Enter a TreeWalley product, category, or seed keyword above.
                  </td>
                </tr>
              ) : (
                filtered.map((kw) => (
                  <tr key={kw.id} className="border-b border-[#F0ECE4] hover:bg-[#FAF8F4] align-top">
                    <td className="py-3 pr-2">
                      <input
                        type="checkbox"
                        checked={compareIds.includes(kw.id)}
                        onChange={() => toggleCompare(kw.id)}
                        className="accent-[#1B4332]"
                        title="Select for comparison"
                      />
                    </td>
                    <td className="py-3 pr-3 max-w-[260px]">
                      <div className="font-semibold text-[#1D221F]">{kw.keyword}</div>
                      <div className="text-[11px] text-[#5C635E] mt-0.5">
                        {kw.country} · {kw.language} · {kw.dataSourceLabel}
                      </div>
                      {kw.longTailKeywordsJson?.length > 0 && (
                        <div className="text-[11px] text-[#6F4E37] mt-1">
                          Long-tail: {kw.longTailKeywordsJson.slice(0, 2).join(', ')}
                        </div>
                      )}
                      {kw.suggestedTopic && (
                        <div className="text-[11px] text-[#1B4332] mt-1">
                          Topic: {kw.suggestedTopic}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right font-mono-tabular">
                      {kw.adsAvgMonthlySearches !== null ? kw.adsAvgMonthlySearches.toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-2 text-[#49504B]">
                      {kw.adsCompetitionLevel || 'Unverified'}
                    </td>
                    <td className="py-3 px-2 text-right font-mono-tabular">
                      {kw.trendsInterestScore !== null ? kw.trendsInterestScore : '—'}
                    </td>
                    <td className="py-3 px-2 text-right font-mono-tabular">
                      {kw.gscClicks !== null ? `${kw.gscClicks} / ${kw.gscImpressions}` : '—'}
                    </td>
                    <td className="py-3 px-2 text-right font-mono-tabular">
                      {kw.gscAvgPosition !== null ? kw.gscAvgPosition : '—'}
                    </td>
                    <td className="py-3 px-2 text-[11px] text-[#49504B]">
                      Comm: {kw.commercialIntent || '—'}
                      <br />
                      Info: {kw.informationalIntent || '—'}
                    </td>
                    <td className="py-3 px-2 text-right font-mono-tabular font-semibold text-[#1B4332]">
                      {kw.opportunityScore ?? '—'}
                    </td>
                    <td className="py-3 pl-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          onCreateBlog(
                            kw.suggestedTopic || `Complete Guide to ${kw.keyword}`,
                            kw.keyword
                          )
                        }
                        className="text-[#1B4332] hover:underline mr-2.5 inline-flex items-center gap-1 cursor-pointer"
                        title="Create blog from keyword"
                      >
                        <PenLine className="w-3.5 h-3.5" />
                        <span>Blog</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(kw.id)}
                        className="text-[#DC2626] hover:opacity-75 inline-flex items-center cursor-pointer"
                        title="Delete keyword"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
