import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCw, ArrowUpRight, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { AdminProfileResponse, GscSnapshot, SidebarModuleId } from '../../types/seo';

interface OverviewViewProps {
  profile: AdminProfileResponse;
  onNavigate: (id: SidebarModuleId) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ profile, onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [gscSites, setGscSites] = useState<Array<{ siteUrl: string; permissionLevel: string }>>([]);
  const [selectedSiteUrl, setSelectedSiteUrl] = useState<string>(
    profile.settings?.searchConsoleSiteUrl || 'https://www.treewalley.com/'
  );
  const [rangePreset, setRangePreset] = useState<'7' | '28' | '90' | 'custom'>('28');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [latestGsc, setLatestGsc] = useState<GscSnapshot | null>(null);
  const [previousGsc, setPreviousGsc] = useState<GscSnapshot | null>(null);
  const [indexSummary, setIndexSummary] = useState<{
    totalInspected: number;
    indexedCount: number;
    notIndexedCount: number;
    issues: Array<{ url: string; coverageState: string; verdict: string }>;
  } | null>(null);
  const [recentArticles, setRecentArticles] = useState<Array<any>>([]);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/overview');
      setLatestGsc(data.latestGsc);
      setPreviousGsc(data.previousGsc);
      setIndexSummary(data.indexSummary);
      setRecentArticles(data.articlesSummary?.recent || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadGscSites = async () => {
    if (profile.googleConnection?.status !== 'connected') return;
    setLoadingSites(true);
    try {
      const res = await apiFetch<{ sites: Array<{ siteUrl: string; permissionLevel: string }> }>('/api/gsc/sites');
      const sites = res.sites || [];
      setGscSites(sites);
      if (sites.length > 0 && !sites.some((s) => s.siteUrl === selectedSiteUrl)) {
        setSelectedSiteUrl(sites[0].siteUrl);
      }
    } catch {
      // Errors surface explicitly when syncing or testing in Google Integrations & Diagnostics
    } finally {
      setLoadingSites(false);
    }
  };

  useEffect(() => {
    loadOverview();
    if (profile.googleConnection?.status === 'connected') {
      loadGscSites();
    }
  }, [profile.googleConnection?.status]);

  const handleSyncGsc = async () => {
    setSyncing(true);
    setError(null);
    try {
      const payload: Record<string, any> = {
        siteUrl: selectedSiteUrl || profile.settings?.searchConsoleSiteUrl || 'https://www.treewalley.com/',
      };
      if (rangePreset === 'custom' && customStart && customEnd) {
        payload.startDate = customStart;
        payload.endDate = customEnd;
      } else {
        payload.days = Number(rangePreset === 'custom' ? 28 : rangePreset);
      }
      const res = await apiFetch('/api/gsc/sync', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setLatestGsc(res.snapshot);
      await loadOverview();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const isConnected = profile.googleConnection?.status === 'connected';

  // Compute newly discovered & declining queries if two snapshots exist
  const prevMap = new Map(
    (previousGsc?.topQueriesJson || []).map((q) => [q.query, q])
  );
  const newlyDiscovered = (latestGsc?.topQueriesJson || [])
    .filter((q) => previousGsc && !prevMap.has(q.query))
    .slice(0, 6);
  const declining = (latestGsc?.topQueriesJson || [])
    .filter((q) => {
      const prev = prevMap.get(q.query);
      return prev && q.position > prev.position + 1;
    })
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E6E0D6] pb-5">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#1D221F]">
            SEO Intelligence Overview
          </h1>
          <div className="mt-1 text-xs text-[#5C635E] flex flex-wrap items-center gap-2">
            <span>Property: {profile.settings?.searchConsoleSiteUrl || 'https://www.treewalley.com/'}</span>
            <span aria-hidden="true">·</span>
            <span>
              {latestGsc
                ? `Reporting Window: ${latestGsc.dateRangeStart} to ${latestGsc.dateRangeEnd} (GSC Delayed ~48h)`
                : 'Search Console Status: Unavailable (Not Synced)'}
            </span>
            {latestGsc && (
              <>
                <span aria-hidden="true">·</span>
                <span>Last Sync: {new Date(latestGsc.syncedAt).toLocaleString()}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isConnected && (
            <>
              <select
                value={selectedSiteUrl}
                onChange={(e) => setSelectedSiteUrl(e.target.value)}
                aria-label="Search Console Property"
                className="px-2.5 py-2 text-xs rounded-md border border-[#E6E0D6] bg-white max-w-[230px]"
              >
                {gscSites.length === 0 ? (
                  <option value={selectedSiteUrl}>
                    {loadingSites ? 'Loading GSC properties...' : selectedSiteUrl}
                  </option>
                ) : (
                  gscSites.map((s) => (
                    <option key={s.siteUrl} value={s.siteUrl}>
                      {s.siteUrl} ({s.permissionLevel})
                    </option>
                  ))
                )}
              </select>

              <select
                value={rangePreset}
                onChange={(e) => setRangePreset(e.target.value as '7' | '28' | '90' | 'custom')}
                aria-label="Date Range"
                className="px-2.5 py-2 text-xs rounded-md border border-[#E6E0D6] bg-white"
              >
                <option value="7">Last 7 Days</option>
                <option value="28">Last 28 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="custom">Custom Range</option>
              </select>

              {rangePreset === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-2 py-1.5 text-xs rounded-md border border-[#E6E0D6] bg-white font-mono-tabular"
                  />
                  <span className="text-xs text-[#5C635E]">to</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-2 py-1.5 text-xs rounded-md border border-[#E6E0D6] bg-white font-mono-tabular"
                  />
                </div>
              )}
            </>
          )}

          {!isConnected && (
            <button
              type="button"
              onClick={() => onNavigate('google-connections')}
              className="px-4 py-2 text-xs font-medium rounded-md border border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332]/5 transition-colors cursor-pointer whitespace-nowrap"
            >
              Connect Google Services
            </button>
          )}
          <button
            type="button"
            onClick={handleSyncGsc}
            disabled={syncing || !isConnected || (rangePreset === 'custom' && (!customStart || !customEnd))}
            className="px-4 py-2 text-xs font-medium rounded-md bg-[#1B4332] text-[#FAF8F4] hover:bg-[#143325] disabled:opacity-50 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing GSC...' : 'Sync Search Console'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {!isConnected && !latestGsc && !loading && (
        <div className="bg-white border border-[#E6E0D6] rounded-lg p-6">
          <h2 className="font-display text-xl font-bold text-[#1D221F]">
            Connect Official Google Search Console
          </h2>
          <p className="mt-2 text-sm text-[#49504B] max-w-2xl leading-relaxed">
            This dashboard displays strictly authentic Search Console clicks, impressions, CTR, average position, device splits, and country performance. No fabricated metrics are shown. Authorize your Google account in Google Connections to pull live TreeWalley data.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('google-connections')}
              className="px-4 py-2 text-xs font-medium rounded-md bg-[#1B4332] text-[#FAF8F4] hover:bg-[#143325] cursor-pointer"
            >
              Open Google Connections
            </button>
            <button
              type="button"
              onClick={() => onNavigate('blog-writer')}
              className="px-4 py-2 text-xs font-medium rounded-md border border-[#E6E0D6] text-[#1D221F] hover:bg-[#FAF8F4] cursor-pointer"
            >
              Open AI Blog Writer
            </button>
          </div>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
          <div className="text-xs text-[#5C635E]">Total Organic Clicks</div>
          <div className="mt-2 text-2xl font-bold text-[#1D221F] font-mono-tabular">
            {latestGsc ? latestGsc.totalClicks.toLocaleString() : '—'}
          </div>
          <div className="mt-1.5 text-[11px] text-[#6F4E37]">
            {latestGsc ? 'Source: Search Console (Delayed ~48h)' : 'Status: Unavailable · Connect GSC'}
          </div>
        </div>

        <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
          <div className="text-xs text-[#5C635E]">Total Impressions</div>
          <div className="mt-2 text-2xl font-bold text-[#1D221F] font-mono-tabular">
            {latestGsc ? latestGsc.totalImpressions.toLocaleString() : '—'}
          </div>
          <div className="mt-1.5 text-[11px] text-[#6F4E37]">
            {latestGsc ? 'Source: Search Console (28-day window)' : 'Status: Unavailable · Connect GSC'}
          </div>
        </div>

        <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
          <div className="text-xs text-[#5C635E]">Average CTR</div>
          <div className="mt-2 text-2xl font-bold text-[#1D221F] font-mono-tabular">
            {latestGsc ? `${latestGsc.avgCtr}%` : '—'}
          </div>
          <div className="mt-1.5 text-[11px] text-[#6F4E37]">
            {latestGsc ? 'Clicks divided by impressions' : 'Status: Unavailable · Connect GSC'}
          </div>
        </div>

        <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
          <div className="text-xs text-[#5C635E]">Average Search Position</div>
          <div className="mt-2 text-2xl font-bold text-[#1D221F] font-mono-tabular">
            {latestGsc ? latestGsc.avgPosition : '—'}
          </div>
          <div className="mt-1.5 text-[11px] text-[#6F4E37]">
            {latestGsc ? 'Historical GSC average (not live SERP)' : 'Status: Unavailable · Connect GSC'}
          </div>
        </div>
      </div>

      {/* Organic Traffic Trend Chart */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-[#1D221F]">
              Organic Traffic Trend
            </h2>
            <p className="text-xs text-[#5C635E]">
              Daily Search Console clicks and impressions for {profile.settings?.targetDomain}
            </p>
          </div>
          <span className="text-xs text-[#5C635E]">
            {latestGsc ? 'Data: Delayed (~48h)' : 'Data: Unavailable'}
          </span>
        </div>

        {latestGsc && latestGsc.dailyTrendJson.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latestGsc.dailyTrendJson}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6E0D6" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5C635E' }} />
                <YAxis tick={{ fontSize: 11, fill: '#5C635E' }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="clicks"
                  stroke="#1B4332"
                  fill="#1B4332"
                  fillOpacity={0.14}
                  name="Clicks"
                />
                <Area
                  type="monotone"
                  dataKey="impressions"
                  stroke="#B68D40"
                  fill="#B68D40"
                  fillOpacity={0.08}
                  name="Impressions"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-52 flex flex-col items-center justify-center border border-dashed border-[#D8D0C2] rounded-md text-center px-6">
            <p className="text-sm text-[#49504B]">
              No Search Console snapshot has been synced yet.
            </p>
            <p className="text-xs text-[#5C635E] mt-1">
              Connect Google Search Console and click &ldquo;Sync Search Console&rdquo; to populate genuine daily trends.
            </p>
          </div>
        )}
      </div>

      {/* Top Queries & Top Pages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
          <h3 className="font-display text-lg font-bold text-[#1D221F] mb-3">
            Top Search Queries
          </h3>
          {latestGsc && latestGsc.topQueriesJson.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E6E0D6] text-[#5C635E]">
                    <th className="text-left py-2 font-medium">Query</th>
                    <th className="text-right py-2 font-medium">Clicks</th>
                    <th className="text-right py-2 font-medium">Impr.</th>
                    <th className="text-right py-2 font-medium">Avg Pos</th>
                  </tr>
                </thead>
                <tbody>
                  {latestGsc.topQueriesJson.slice(0, 8).map((q, idx) => (
                    <tr key={idx} className="border-b border-[#F0ECE4] hover:bg-[#FAF8F4]">
                      <td className="py-2 pr-3 text-[#1D221F] font-medium">{q.query}</td>
                      <td className="py-2 text-right font-mono-tabular">{q.clicks}</td>
                      <td className="py-2 text-right font-mono-tabular">{q.impressions}</td>
                      <td className="py-2 text-right font-mono-tabular">{q.position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-[#5C635E] py-6">
              Unavailable until Search Console is connected and synced.
            </p>
          )}
        </div>

        <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
          <h3 className="font-display text-lg font-bold text-[#1D221F] mb-3">
            Top Performing Pages
          </h3>
          {latestGsc && latestGsc.topPagesJson.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E6E0D6] text-[#5C635E]">
                    <th className="text-left py-2 font-medium">URL</th>
                    <th className="text-right py-2 font-medium">Clicks</th>
                    <th className="text-right py-2 font-medium">CTR</th>
                    <th className="text-right py-2 font-medium">Pos</th>
                  </tr>
                </thead>
                <tbody>
                  {latestGsc.topPagesJson.slice(0, 8).map((p, idx) => (
                    <tr key={idx} className="border-b border-[#F0ECE4] hover:bg-[#FAF8F4]">
                      <td className="py-2 pr-3 text-[#1B4332] truncate max-w-[230px]" title={p.page}>
                        {p.page}
                      </td>
                      <td className="py-2 text-right font-mono-tabular">{p.clicks}</td>
                      <td className="py-2 text-right font-mono-tabular">{p.ctr}%</td>
                      <td className="py-2 text-right font-mono-tabular">{p.position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-[#5C635E] py-6">
              Unavailable until Search Console is connected and synced.
            </p>
          )}
        </div>
      </div>

      {/* Indexing, Device, Country, Newly Discovered / Declining Keywords */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg font-bold text-[#1D221F]">
              Index Coverage Summary
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('index-monitor')}
              className="text-xs text-[#1B4332] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Inspect</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 py-2 border-b border-[#F0ECE4]">
            <div>
              <div className="text-xs text-[#5C635E]">Indexed URLs</div>
              <div className="text-xl font-bold text-[#16A34A] font-mono-tabular">
                {indexSummary?.indexedCount ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#5C635E]">Not Indexed / Issues</div>
              <div className="text-xl font-bold text-[#D97706] font-mono-tabular">
                {indexSummary?.notIndexedCount ?? 0}
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            {(indexSummary?.issues || []).length === 0 ? (
              <p className="text-[#5C635E]">No crawling or indexing issues recorded yet.</p>
            ) : (
              indexSummary?.issues.map((iss, idx) => (
                <div key={idx} className="truncate text-[#49504B]">
                  <span className="text-[#D97706] font-medium">{iss.coverageState}</span> · {iss.url}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
          <h3 className="font-display text-lg font-bold text-[#1D221F] mb-3">
            Mobile vs Desktop &amp; Country Split
          </h3>
          {latestGsc && latestGsc.devicesJson.length > 0 ? (
            <div className="space-y-4 text-xs">
              <div>
                <div className="text-[#5C635E] font-medium mb-1.5">By Device</div>
                {latestGsc.devicesJson.map((d, i) => (
                  <div key={i} className="flex justify-between py-1 border-b border-[#F0ECE4]">
                    <span className="capitalize">{d.device.toLowerCase()}</span>
                    <span className="font-mono-tabular">
                      {d.clicks} clicks · {d.impressions} impr
                    </span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[#5C635E] font-medium mb-1.5">Top Countries</div>
                {latestGsc.countriesJson.slice(0, 4).map((c, i) => (
                  <div key={i} className="flex justify-between py-1 border-b border-[#F0ECE4]">
                    <span className="uppercase">{c.country}</span>
                    <span className="font-mono-tabular">
                      {c.clicks} clicks · pos {c.position}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#5C635E] py-4">
              Device and country breakdown will appear once Search Console sync completes.
            </p>
          )}
        </div>

        <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
          <h3 className="font-display text-lg font-bold text-[#1D221F] mb-3">
            Keyword Movement &amp; Recent Articles
          </h3>
          <div className="space-y-3 text-xs">
            <div>
              <div className="text-[#5C635E] font-medium mb-1">
                Newly Discovered / Declining Keywords
              </div>
              {newlyDiscovered.length === 0 && declining.length === 0 ? (
                <p className="text-[#5C635E]">
                  Requires 2+ synced Search Console snapshots to detect newly discovered or declining queries.
                </p>
              ) : (
                <div className="space-y-1">
                  {newlyDiscovered.map((q, i) => (
                    <div key={`new-${i}`} className="text-[#16A34A]">
                      New: {q.query} (pos {q.position})
                    </div>
                  ))}
                  {declining.map((q, i) => (
                    <div key={`dec-${i}`} className="text-[#DC2626]">
                      Declining: {q.query} (pos {q.position})
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="pt-2 border-t border-[#F0ECE4]">
              <div className="text-[#5C635E] font-medium mb-1">Recent Editorial Articles</div>
              {recentArticles.length === 0 ? (
                <p className="text-[#5C635E]">No articles drafted yet.</p>
              ) : (
                recentArticles.slice(0, 4).map((a) => (
                  <div key={a.id} className="flex justify-between py-1">
                    <span className="truncate pr-2 text-[#1D221F]">{a.title}</span>
                    <span className="font-mono-tabular text-[#6F4E37] shrink-0">
                      {a.status} · {a.seoScore}/100
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
