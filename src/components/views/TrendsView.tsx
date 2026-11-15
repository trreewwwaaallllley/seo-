import React, { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FileUp, Info, PlusCircle, Sparkles } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { TrendSnapshot } from '../../types/seo';

const FURNITURE_CATEGORIES = [
  'Wooden bed',
  'King size bed',
  'Queen size bed',
  'Sheesham wood furniture',
  'Wooden wardrobe',
  'Wooden almari',
  'Coffee table',
  'Wooden cabinet',
  'Dining table',
  'TV unit',
  'Solid wood furniture',
];

interface TrendsViewProps {
  trendsApiApproved: boolean;
  onDraftFromTopic: (topic: string, keyword: string, category: string) => void;
}

export const TrendsView: React.FC<TrendsViewProps> = ({
  trendsApiApproved,
  onDraftFromTopic,
}) => {
  const [trends, setTrends] = useState<TrendSnapshot[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Wooden bed');
  const [keyword, setKeyword] = useState('sheesham wood king size bed');
  const [country, setCountry] = useState('India');
  const [region, setRegion] = useState('Maharashtra');
  const [timeframe, setTimeframe] = useState('12m');
  const [csvText, setCsvText] = useState('');
  const [risingQueriesText, setRisingQueriesText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTrend, setActiveTrend] = useState<TrendSnapshot | null>(null);

  const loadTrends = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/trends');
      setTrends(data.trends || []);
      if (data.trends?.length > 0 && !activeTrend) {
        setActiveTrend(data.trends[0]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrends();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ''));
    };
    reader.readAsText(file);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/trends/import', {
        method: 'POST',
        body: JSON.stringify({
          category: selectedCategory,
          keyword,
          country,
          region,
          timeframe,
          csvText,
          risingQueriesText,
        }),
      });
      await loadTrends();
      setActiveTrend(res.trend);
      setCsvText('');
      setRisingQueriesText('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E6E0D6] pb-5">
        <h1 className="font-display text-3xl font-bold text-[#1D221F]">
          Google Search Trends Explorer
        </h1>
        <div className="mt-1 text-xs text-[#5C635E] flex flex-wrap items-center gap-2">
          <span>
            API Status:{' '}
            <strong className="text-[#1D221F]">
              {trendsApiApproved
                ? 'Official Google Trends API Approved'
                : 'Official Trends API Unavailable · Manual CSV Import Active'}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>Never scrapes restricted endpoints or fabricates trend series</span>
        </div>
      </div>

      <div className="p-4 rounded-md border border-[#B68D40]/40 bg-[#FFFDF7] text-xs text-[#49504B] flex items-start gap-3">
        <Info className="w-4 h-4 text-[#B68D40] shrink-0 mt-0.5" />
        <div>
          Export your official CSV from <span className="font-mono-tabular">trends.google.com</span> (multiTimeline.csv) and upload or paste it below. The system parses genuine Google Trends time-series values, detects seasonal furniture cycles, and discovers blog topics.
        </div>
      </div>

      {/* Furniture Category Selector */}
      <div className="flex flex-wrap gap-1.5">
        {FURNITURE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => {
              setSelectedCategory(cat);
              setKeyword(cat.toLowerCase());
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
              selectedCategory === cat
                ? 'bg-[#1B4332] text-[#FAF8F4] border-[#1B4332]'
                : 'bg-white text-[#49504B] border-[#E6E0D6] hover:border-[#1B4332]/50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Manual Trends CSV Import Form */}
        <form
          onSubmit={handleImport}
          className="lg:col-span-5 bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4 text-xs"
        >
          <h2 className="font-display text-xl font-bold text-[#1D221F]">
            Import Official Trends CSV
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
              >
                {FURNITURE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Timeframe</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
              >
                <option value="7d">Daily (Last 7 Days)</option>
                <option value="3m">Weekly (Last 90 Days)</option>
                <option value="12m">Monthly (Past 12 Months)</option>
                <option value="5y">Seasonal (5 Years)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1">Tracked Search Term</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Country</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">State / Region</label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="e.g. Karnataka, Delhi NCR"
                className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-[#1D221F]">
                Google Trends Time-Series CSV
              </label>
              <label className="text-[#1B4332] hover:underline cursor-pointer flex items-center gap-1">
                <FileUp className="w-3.5 h-3.5" />
                <span>Load .csv file</span>
                <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            <textarea
              rows={4}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'2026-01,68\n2026-02,74\n2026-03,82'}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular text-[11px]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Rising Queries (Optional, one per line: query, growth)
            </label>
            <textarea
              rows={3}
              value={risingQueriesText}
              onChange={(e) => setRisingQueriesText(e.target.value)}
              placeholder={'sheesham wood king bed with storage,+180%\nsolid wood bed price india,Breakout'}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular text-[11px]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium hover:bg-[#143325] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{submitting ? 'Importing & Discovering Topics...' : 'Import Trend Data & Discover Topics'}</span>
          </button>
        </form>

        {/* Trend Visualization & Topic Discovery */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-[#1D221F]">
                  {activeTrend ? `Interest Over Time: ${activeTrend.keyword}` : 'Interest Over Time'}
                </h2>
                <p className="text-xs text-[#5C635E]">
                  {activeTrend
                    ? `${activeTrend.category} · ${activeTrend.country} (${activeTrend.region}) · Source: ${activeTrend.sourceType}`
                    : 'Select or import a Google Trends export to plot search interest.'}
                </p>
              </div>
              {trends.length > 0 && (
                <select
                  value={activeTrend?.id || ''}
                  onChange={(e) => {
                    const found = trends.find((t) => t.id === Number(e.target.value));
                    if (found) setActiveTrend(found);
                  }}
                  className="px-2.5 py-1.5 text-xs border border-[#E6E0D6] rounded-md"
                >
                  {trends.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.keyword} ({t.category})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {activeTrend && activeTrend.interestSeriesJson.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={activeTrend.interestSeriesJson}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6E0D6" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5C635E' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#5C635E' }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#1B4332"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#B68D40' }}
                      name="Relative Search Interest"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-52 flex items-center justify-center border border-dashed border-[#D8D0C2] rounded-md text-xs text-[#5C635E]">
                {loading
                  ? 'Loading saved trend snapshots...'
                  : 'No time-series points imported yet. Paste or upload an official Google Trends CSV on the left.'}
              </div>
            )}
          </div>

          {activeTrend && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
                <h3 className="font-display text-lg font-bold text-[#1D221F] mb-2">
                  Rising Queries &amp; Seasonal Signal
                </h3>
                {activeTrend.seasonalNote && (
                  <p className="text-xs text-[#49504B] leading-relaxed mb-3 pb-3 border-b border-[#F0ECE4]">
                    {activeTrend.seasonalNote}
                  </p>
                )}
                {activeTrend.risingQueriesJson.length === 0 ? (
                  <p className="text-xs text-[#5C635E]">No rising queries imported for this snapshot.</p>
                ) : (
                  <div className="space-y-2 text-xs">
                    {activeTrend.risingQueriesJson.map((rq, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-[#1D221F]">{rq.query}</span>
                        <span className="font-mono-tabular text-[#16A34A]">{rq.growth}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
                <h3 className="font-display text-lg font-bold text-[#1D221F] mb-2">
                  Discovered Blog Topics
                </h3>
                <div className="space-y-2.5 text-xs">
                  {activeTrend.discoveredTopicsJson.map((topic, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between gap-2 pb-2 border-b border-[#F0ECE4] last:border-b-0"
                    >
                      <span className="text-[#1D221F] leading-snug">{topic}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onDraftFromTopic(topic, activeTrend.keyword, activeTrend.category)
                        }
                        className="text-[#1B4332] hover:underline shrink-0 flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Write</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
