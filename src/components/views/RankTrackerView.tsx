import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Info } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { RankRow } from '../../types/seo';

const RANK_BUCKETS = ['All', '1-3', '4-10', '11-20', '21-50', '51-100', '100+'];

export const RankTrackerView: React.FC = () => {
  const [ranks, setRanks] = useState<RankRow[]>([]);
  const [bucket, setBucket] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiFetch('/api/ranks');
        setRanks(data.ranks || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const bucketCounts = ['1-3', '4-10', '11-20', '21-50', '51-100', '100+'].map((b) => ({
    bucket: `Pos ${b}`,
    count: ranks.filter((r) => r.bucket === b).length,
  }));

  const filtered = ranks.filter((r) => {
    if (bucket !== 'All' && r.bucket !== bucket) return false;
    if (
      search.trim() &&
      !r.keyword.toLowerCase().includes(search.toLowerCase()) &&
      !r.landingPage.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E6E0D6] pb-5">
        <h1 className="font-display text-3xl font-bold text-[#1D221F]">
          Google Search Console Rank Tracker
        </h1>
        <p className="mt-1 text-xs text-[#5C635E]">
          Uses actual Google Search Console average position data for your verified website.
        </p>
      </div>

      <div className="p-4 rounded-md border border-[#B68D40]/40 bg-[#FFFDF7] text-xs text-[#49504B] flex items-start gap-3">
        <Info className="w-4 h-4 text-[#B68D40] shrink-0 mt-0.5" />
        <div>
          <strong>Methodology Note:</strong> Search Console average position reflects historical aggregate impressions across queries and devices—it is not an exact live Google SERP rank check, and no SEO tool can guarantee first-page rankings.
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs">
          {error}
        </div>
      )}

      {/* Position Distribution Chart */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
        <h2 className="font-display text-xl font-bold text-[#1D221F] mb-3">
          Ranking Distribution by Position Bracket
        </h2>
        {ranks.length > 0 ? (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bucketCounts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6E0D6" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#5C635E' }} />
                <YAxis tick={{ fontSize: 11, fill: '#5C635E' }} />
                <Tooltip />
                <Bar dataKey="count" fill="#1B4332" radius={[4, 4, 0, 0]} name="Tracked Queries" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-44 flex items-center justify-center border border-dashed border-[#D8D0C2] rounded-md text-xs text-[#5C635E]">
            {loading
              ? 'Loading ranking history...'
              : 'No Search Console ranking records yet. Sync Google Search Console from Overview.'}
          </div>
        )}
      </div>

      {/* Filters & Table */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {RANK_BUCKETS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBucket(b)}
                className={`px-3 py-1.5 text-xs rounded-md border cursor-pointer whitespace-nowrap ${
                  bucket === b
                    ? 'bg-[#1B4332] text-[#FAF8F4] border-[#1B4332]'
                    : 'bg-white text-[#49504B] border-[#E6E0D6]'
                }`}
              >
                {b === 'All' ? 'All Positions' : b === '100+' ? 'Outside 100' : `Positions ${b}`}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter query or landing page..."
            className="px-3 py-1.5 text-xs rounded-md border border-[#E6E0D6] w-full md:w-64"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E6E0D6] text-[#5C635E]">
                <th className="text-left py-2.5 pr-3 font-medium">Keyword</th>
                <th className="text-left py-2.5 pr-3 font-medium">Landing Page</th>
                <th className="text-right py-2.5 px-2 font-medium">Avg Position</th>
                <th className="text-right py-2.5 px-2 font-medium">Clicks</th>
                <th className="text-right py-2.5 px-2 font-medium">Impressions</th>
                <th className="text-right py-2.5 px-2 font-medium">CTR</th>
                <th className="text-left py-2.5 pl-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#5C635E]">
                    No ranking rows match the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-[#F0ECE4] hover:bg-[#FAF8F4]">
                    <td className="py-2.5 pr-3 font-medium text-[#1D221F]">{r.keyword}</td>
                    <td className="py-2.5 pr-3 text-[#1B4332] truncate max-w-[240px]" title={r.landingPage}>
                      {r.landingPage}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-tabular font-semibold">
                      {r.avgPosition}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-tabular">{r.clicks}</td>
                    <td className="py-2.5 px-2 text-right font-mono-tabular">{r.impressions}</td>
                    <td className="py-2.5 px-2 text-right font-mono-tabular">{r.ctr}%</td>
                    <td className="py-2.5 pl-2 font-mono-tabular text-[#5C635E]">{r.date}</td>
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
