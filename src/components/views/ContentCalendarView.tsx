import React, { useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Article } from '../../types/seo';

interface ContentCalendarViewProps {
  maxDailyPublishLimit: number;
  onOpenArticleInBlogger: (articleId: number) => void;
}

export const ContentCalendarView: React.FC<ContentCalendarViewProps> = ({
  maxDailyPublishLimit,
  onOpenArticleInBlogger,
}) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [keywordSearch, setKeywordSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadArticles = async () => {
    try {
      const res = await apiFetch('/api/articles');
      setArticles(res.articles || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadArticles();
  }, []);

  const categories = ['all', ...Array.from(new Set(articles.map((a) => a.blogCategory)))];
  const languages = ['all', ...Array.from(new Set(articles.map((a) => a.languageName)))];

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && a.blogCategory !== categoryFilter) return false;
      if (languageFilter !== 'all' && a.languageName !== languageFilter) return false;
      if (
        keywordSearch.trim() &&
        !a.primaryKeyword.toLowerCase().includes(keywordSearch.toLowerCase()) &&
        !a.title.toLowerCase().includes(keywordSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [articles, statusFilter, categoryFilter, languageFilter, keywordSearch]);

  // Build calendar grid for monthFilter (YYYY-MM)
  const [yearNum, monthNum] = monthFilter.split('-').map(Number);
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const firstWeekday = new Date(yearNum, monthNum - 1, 1).getDay();

  const dayMap = new Map<number, Article[]>();
  for (const a of filtered) {
    const refDate = a.scheduledFor || a.publishedAt || a.createdAt;
    if (refDate && refDate.slice(0, 7) === monthFilter) {
      const d = Number(refDate.slice(8, 10));
      const existing = dayMap.get(d) || [];
      existing.push(a);
      dayMap.set(d, existing);
    }
  }

  const handleReschedule = async (articleId: number, dateStr: string) => {
    try {
      await apiFetch(`/api/articles/${articleId}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'scheduled',
          scheduledFor: new Date(`${dateStr}T09:00:00`).toISOString(),
        }),
      });
      await loadArticles();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E6E0D6] pb-5">
        <h1 className="font-display text-3xl font-bold text-[#1D221F]">
          Editorial Content Calendar
        </h1>
        <p className="mt-1 text-xs text-[#5C635E]">
          Track drafts, pending approvals, approved posts, scheduled queues, published posts, and failures. Daily publishing guard: max {maxDailyPublishLimit} post(s)/day.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs">
          {error}
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        <div>
          <label className="block font-medium text-[#5C635E] mb-1">Month</label>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md border border-[#E6E0D6] font-mono-tabular"
          />
        </div>
        <div>
          <label className="block font-medium text-[#5C635E] mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md border border-[#E6E0D6]"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div>
          <label className="block font-medium text-[#5C635E] mb-1">Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md border border-[#E6E0D6]"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All Categories' : c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium text-[#5C635E] mb-1">Language</label>
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md border border-[#E6E0D6]"
          >
            {languages.map((l) => (
              <option key={l} value={l}>
                {l === 'all' ? 'All Languages' : l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium text-[#5C635E] mb-1">Keyword / Title</label>
          <input
            type="text"
            value={keywordSearch}
            onChange={(e) => setKeywordSearch(e.target.value)}
            placeholder="Filter keyword..."
            className="w-full px-2.5 py-1.5 rounded-md border border-[#E6E0D6]"
          />
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 gap-2 text-xs font-medium text-[#5C635E] mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="px-2 py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[96px] bg-[#FAF8F4]/60 rounded-md" />
            ))}
            {Array.from({ length: daysInMonth }, (_, idx) => {
              const day = idx + 1;
              const items = dayMap.get(day) || [];
              const overCap = items.length > maxDailyPublishLimit;
              return (
                <div
                  key={day}
                  className="min-h-[96px] border border-[#E6E0D6] rounded-md p-2 flex flex-col justify-between bg-white"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[#5C635E]">
                    <span>{day}</span>
                    {overCap && (
                      <span title="Exceeds daily publish cap" className="text-[#D97706]">
                        <AlertTriangle className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 mt-1">
                    {items.slice(0, 3).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onOpenArticleInBlogger(a.id)}
                        className="w-full text-left text-[11px] px-1.5 py-1 rounded bg-[#FAF8F4] border border-[#E6E0D6] hover:border-[#1B4332] truncate cursor-pointer"
                        title={`${a.title} (${a.status})`}
                      >
                        <span className="font-medium text-[#1B4332]">{a.status}:</span> {a.title}
                      </button>
                    ))}
                    {items.length > 3 && (
                      <div className="text-[10px] text-[#5C635E]">+{items.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reschedule List */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-5">
        <h2 className="font-display text-xl font-bold text-[#1D221F] mb-3 flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-[#1B4332]" />
          <span>Pipeline Schedule ({filtered.length} articles)</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E6E0D6] text-[#5C635E]">
                <th className="text-left py-2 pr-3 font-medium">Title</th>
                <th className="text-left py-2 px-2 font-medium">Keyword &amp; Category</th>
                <th className="text-left py-2 px-2 font-medium">Language</th>
                <th className="text-left py-2 px-2 font-medium">Status</th>
                <th className="text-left py-2 pl-2 font-medium">Schedule Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-[#F0ECE4]">
                  <td className="py-2.5 pr-3 font-medium text-[#1D221F]">{a.title}</td>
                  <td className="py-2.5 px-2 text-[#49504B]">
                    {a.primaryKeyword} · {a.blogCategory}
                  </td>
                  <td className="py-2.5 px-2 text-[#5C635E]">{a.languageName}</td>
                  <td className="py-2.5 px-2 capitalize font-medium text-[#1B4332]">{a.status}</td>
                  <td className="py-2.5 pl-2">
                    <input
                      type="date"
                      value={(a.scheduledFor || a.publishedAt || a.createdAt).slice(0, 10)}
                      onChange={(e) => handleReschedule(a.id, e.target.value)}
                      className="px-2 py-1 rounded border border-[#E6E0D6] font-mono-tabular"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
