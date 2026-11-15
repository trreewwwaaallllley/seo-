import React, { useEffect, useState } from 'react';
import { ExternalLink, Info, RefreshCw, SearchCheck, Send } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { IndexInspectionRow } from '../../types/seo';

interface IndexMonitorViewProps {
  defaultSiteUrl: string;
  defaultSitemapUrl: string;
  isGoogleConnected: boolean;
  onGoToConnections: () => void;
}

export const IndexMonitorView: React.FC<IndexMonitorViewProps> = ({
  defaultSiteUrl,
  defaultSitemapUrl,
  isGoogleConnected,
  onGoToConnections,
}) => {
  const [inspections, setInspections] = useState<IndexInspectionRow[]>([]);
  const [sitemaps, setSitemaps] = useState<Array<any>>([]);
  const [siteUrl, setSiteUrl] = useState(defaultSiteUrl || 'https://www.treewalley.com/');
  const [inspectionUrl, setInspectionUrl] = useState('https://www.treewalley.com/');
  const [sitemapFeed, setSitemapFeed] = useState(
    defaultSitemapUrl || 'https://www.treewalley.com/sitemap.xml'
  );
  const [inspecting, setInspecting] = useState(false);
  const [submittingMap, setSubmittingMap] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = await apiFetch('/api/index-monitor');
      setInspections(res.inspections || []);
      if (isGoogleConnected) {
        const smRes = await apiFetch(
          `/api/index-monitor/sitemaps?siteUrl=${encodeURIComponent(siteUrl)}`
        ).catch(() => ({ sitemaps: [] }));
        setSitemaps(smRes.sitemaps || []);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [isGoogleConnected]);

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    setInspecting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch('/api/index-monitor/inspect', {
        method: 'POST',
        body: JSON.stringify({ siteUrl, inspectionUrl }),
      });
      setMessage(
        `Inspection complete: ${res.inspection.url} — ${res.inspection.coverageState} (${res.inspection.verdict})`
      );
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInspecting(false);
    }
  };

  const handleSubmitSitemap = async () => {
    setSubmittingMap(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/api/index-monitor/submit-sitemap', {
        method: 'POST',
        body: JSON.stringify({ siteUrl, feedpath: sitemapFeed }),
      });
      setMessage(`Sitemap submitted to Google Search Console: ${sitemapFeed}`);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingMap(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E6E0D6] pb-5">
        <h1 className="font-display text-3xl font-bold text-[#1D221F]">
          Google Index Monitor &amp; URL Inspection
        </h1>
        <p className="mt-1 text-xs text-[#5C635E]">
          Uses the official Search Console URL Inspection API and Sitemaps API for owned &amp; verified URLs.
        </p>
      </div>

      <div className="p-4 rounded-md border border-[#B68D40]/40 bg-[#FFFDF7] text-xs text-[#49504B] flex items-start gap-3">
        <Info className="w-4 h-4 text-[#B68D40] shrink-0 mt-0.5" />
        <div>
          <strong>Compliance Notice:</strong> Ordinary furniture blog articles do not use the Google Indexing API (which Google restricts to JobPosting and BroadcastEvent structured data). To request re-crawling of an updated URL, use the guided Search Console URL Inspection link below. No tool can guarantee instant indexing.
        </div>
      </div>

      {!isGoogleConnected && (
        <div className="p-4 rounded-md border border-[#D97706]/40 bg-[#FFFBEB] text-[#92400E] text-xs flex flex-wrap items-center justify-between gap-3">
          <span>Connect Google Search Console to run live URL inspections and submit sitemaps.</span>
          <button
            type="button"
            onClick={onGoToConnections}
            className="px-3 py-1.5 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium cursor-pointer"
          >
            Authorize Search Console
          </button>
        </div>
      )}

      {message && (
        <div className="p-3.5 rounded-md border border-[#16A34A]/30 bg-[#F0FDF4] text-[#166534] text-xs">
          {message}
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* URL Inspection Runner */}
        <form
          onSubmit={handleInspect}
          className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4 text-xs"
        >
          <h2 className="font-display text-xl font-bold text-[#1D221F]">
            Inspect Verified URL
          </h2>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Search Console Property (siteUrl)
            </label>
            <input
              type="text"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular"
            />
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Page URL to Inspect
            </label>
            <input
              type="url"
              value={inspectionUrl}
              onChange={(e) => setInspectionUrl(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a
              href={`https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(
                siteUrl
              )}`}
              target="_blank"
              rel="noreferrer"
              className="text-[#1B4332] hover:underline inline-flex items-center gap-1"
            >
              <span>Guided Manual Request Indexing in GSC</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="submit"
              disabled={!isGoogleConnected || inspecting}
              className="px-4 py-2 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium hover:bg-[#143325] disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <SearchCheck className="w-3.5 h-3.5" />
              <span>{inspecting ? 'Inspecting...' : 'Inspect Index Status'}</span>
            </button>
          </div>
        </form>

        {/* Sitemap Submission & Status */}
        <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4 text-xs">
          <h2 className="font-display text-xl font-bold text-[#1D221F]">
            Sitemap Submission &amp; Monitoring
          </h2>
          <div className="flex gap-2">
            <input
              type="url"
              value={sitemapFeed}
              onChange={(e) => setSitemapFeed(e.target.value)}
              className="flex-1 px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular"
            />
            <button
              type="button"
              onClick={handleSubmitSitemap}
              disabled={!isGoogleConnected || submittingMap}
              className="px-4 py-2 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium disabled:opacity-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submittingMap ? 'Submitting...' : 'Submit Sitemap'}</span>
            </button>
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {sitemaps.length === 0 ? (
              <p className="text-[#5C635E]">
                No Search Console sitemaps loaded yet.
              </p>
            ) : (
              sitemaps.map((sm, idx) => (
                <div key={idx} className="p-2.5 border border-[#E6E0D6] rounded-md flex justify-between">
                  <span className="font-mono-tabular text-[#1B4332] truncate pr-2">{sm.path}</span>
                  <span className="text-[#5C635E] shrink-0">
                    {sm.lastSubmitted ? `Submitted ${sm.lastSubmitted.slice(0, 10)}` : 'Active'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Inspection Results Table */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-bold text-[#1D221F]">
            URL Inspection History ({inspections.length})
          </h2>
          <button
            type="button"
            onClick={loadData}
            className="text-xs text-[#1B4332] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E6E0D6] text-[#5C635E]">
                <th className="text-left py-2 pr-3 font-medium">Inspected URL</th>
                <th className="text-left py-2 px-2 font-medium">Verdict</th>
                <th className="text-left py-2 px-2 font-medium">Coverage State</th>
                <th className="text-left py-2 px-2 font-medium">Canonical</th>
                <th className="text-left py-2 pl-2 font-medium">Last Crawl</th>
              </tr>
            </thead>
            <tbody>
              {inspections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#5C635E]">
                    No URLs inspected yet.
                  </td>
                </tr>
              ) : (
                inspections.map((row) => (
                  <tr key={row.id} className="border-b border-[#F0ECE4]">
                    <td className="py-2.5 pr-3 font-mono-tabular text-[#1B4332] max-w-[240px] truncate">
                      {row.url}
                    </td>
                    <td className="py-2.5 px-2 font-medium">
                      <span
                        className={
                          row.verdict === 'PASS'
                            ? 'text-[#16A34A]'
                            : row.verdict === 'FAIL'
                            ? 'text-[#DC2626]'
                            : 'text-[#D97706]'
                        }
                      >
                        {row.verdict}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-[#1D221F]">{row.coverageState}</td>
                    <td className="py-2.5 px-2 font-mono-tabular text-[11px] text-[#5C635E] max-w-[200px] truncate">
                      Google: {row.googleCanonical || '—'}
                    </td>
                    <td className="py-2.5 pl-2 font-mono-tabular text-[#5C635E] whitespace-nowrap">
                      {row.lastCrawlTime ? new Date(row.lastCrawlTime).toLocaleDateString() : '—'}
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
