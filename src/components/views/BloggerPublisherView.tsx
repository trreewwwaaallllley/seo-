import React, { useEffect, useState } from 'react';
import { CalendarClock, ExternalLink, RefreshCw, Save, Send, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Article, BloggerBlog, BloggerPostItem, PublishingLogRow } from '../../types/seo';

interface BloggerPublisherViewProps {
  preselectedArticleId?: number | null;
  isGoogleConnected: boolean;
  onGoToConnections: () => void;
}

export const BloggerPublisherView: React.FC<BloggerPublisherViewProps> = ({
  preselectedArticleId,
  isGoogleConnected,
  onGoToConnections,
}) => {
  const [blogs, setBlogs] = useState<BloggerBlog[]>([]);
  const [bloggerPosts, setBloggerPosts] = useState<BloggerPostItem[]>([]);
  const [postStatusFilter, setPostStatusFilter] = useState<'all' | 'live' | 'draft' | 'scheduled'>('all');
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [logs, setLogs] = useState<PublishingLogRow[]>([]);
  const [selectedBlogId, setSelectedBlogId] = useState('');
  const [selectedArticleId, setSelectedArticleId] = useState<number | ''>('');
  const [labelsInput, setLabelsInput] = useState('');
  const [scheduledIso, setScheduledIso] = useState('');
  const [confirmMode, setConfirmMode] = useState<'draft' | 'publish' | 'schedule' | null>(null);
  const [loadingBlogs, setLoadingBlogs] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [artRes, logRes] = await Promise.all([
        apiFetch('/api/articles'),
        apiFetch('/api/blogger/logs'),
      ]);
      const artList: Article[] = artRes.articles || [];
      setArticles(artList);
      setLogs(logRes.logs || []);

      const targetId = preselectedArticleId || artList[0]?.id || '';
      if (targetId) {
        setSelectedArticleId(targetId);
        const found = artList.find((a) => a.id === targetId);
        if (found) setLabelsInput((found.labelsJson || []).join(', '));
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchBloggerPosts = async (blogId: string, statusFilter = postStatusFilter) => {
    if (!isGoogleConnected || !blogId) return;
    setLoadingPosts(true);
    try {
      const res = await apiFetch<{ items: BloggerPostItem[] }>(
        `/api/blogger/posts?blogId=${encodeURIComponent(blogId)}&status=${statusFilter}`
      );
      setBloggerPosts(res.items || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingPosts(false);
    }
  };

  const fetchBlogs = async () => {
    if (!isGoogleConnected) return;
    setLoadingBlogs(true);
    setError(null);
    try {
      const res = await apiFetch('/api/blogger/blogs');
      setBlogs(res.blogs || []);
      const targetBlogId = selectedBlogId || res.blogs?.[0]?.id || '';
      if (res.blogs?.length > 0 && !selectedBlogId) {
        setSelectedBlogId(targetBlogId);
      }
      if (targetBlogId) {
        await fetchBloggerPosts(targetBlogId, postStatusFilter);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingBlogs(false);
    }
  };

  useEffect(() => {
    loadData();
    if (isGoogleConnected) fetchBlogs();
  }, [isGoogleConnected, preselectedArticleId]);

  useEffect(() => {
    if (isGoogleConnected && selectedBlogId) {
      fetchBloggerPosts(selectedBlogId, postStatusFilter);
    }
  }, [selectedBlogId, postStatusFilter]);

  const currentArticle = articles.find((a) => a.id === Number(selectedArticleId));
  const currentBlog = blogs.find((b) => b.id === selectedBlogId);

  const executeBloggerAction = async (mode: 'draft' | 'publish' | 'schedule') => {
    if (!currentArticle || !selectedBlogId) return;
    setPublishing(true);
    setConfirmMode(null);
    setError(null);
    setMessage(null);
    try {
      // Save updated labels first
      const parsedLabels = labelsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await apiFetch(`/api/articles/${currentArticle.id}`, {
        method: 'PUT',
        body: JSON.stringify({ labelsJson: parsedLabels }),
      });

      const res = await apiFetch('/api/blogger/publish', {
        method: 'POST',
        body: JSON.stringify({
          articleId: currentArticle.id,
          blogId: selectedBlogId,
          blogName: currentBlog?.name || selectedBlogId,
          mode,
          scheduledIso: mode === 'schedule' ? scheduledIso : undefined,
        }),
      });
      setMessage(
        `Blogger ${mode} succeeded for "${res.article.title}" (Post ID: ${res.article.bloggerPostId}).`
      );
      await loadData();
    } catch (err: any) {
      setError(err.message);
      await loadData();
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E6E0D6] pb-5">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#1D221F]">
            Google Blogger Auto Publisher
          </h1>
          <p className="mt-1 text-xs text-[#5C635E]">
            Publishes HTML articles with public HTTPS image URLs via Blogger API v3 and tracks Post IDs to prevent duplicate posts on retries.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchBlogs}
          disabled={!isGoogleConnected || loadingBlogs}
          className="px-4 py-2 text-xs font-medium rounded-md border border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332]/5 disabled:opacity-50 flex items-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingBlogs ? 'animate-spin' : ''}`} />
          <span>Refresh Blogger Blogs</span>
        </button>
      </div>

      {!isGoogleConnected && (
        <div className="p-4 rounded-md border border-[#D97706]/40 bg-[#FFFBEB] text-[#92400E] text-xs flex flex-wrap items-center justify-between gap-3">
          <span>Google Blogger API v3 is not authorized yet. Connect Google Blogger scope to load your blogs.</span>
          <button
            type="button"
            onClick={onGoToConnections}
            className="px-3 py-1.5 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium cursor-pointer"
          >
            Authorize Blogger
          </button>
        </div>
      )}

      {message && (
        <div className="p-3.5 rounded-md border border-[#16A34A]/30 bg-[#F0FDF4] text-[#166534] text-xs">
          {message}
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmMode && currentArticle && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E6E0D6] rounded-lg max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-xl font-bold text-[#1D221F]">
              Confirm Blogger {confirmMode === 'publish' ? 'Publication' : 'Scheduled Post'}
            </h3>
            <p className="text-xs text-[#49504B] leading-relaxed">
              You are about to {confirmMode === 'publish' ? 'publish live' : 'schedule'} <strong>&ldquo;{currentArticle.title}&rdquo;</strong> to Blogger blog <strong>{currentBlog?.name || selectedBlogId}</strong>.
              {currentArticle.bloggerPostId
                ? ` Existing Post ID ${currentArticle.bloggerPostId} will be updated (zero duplicate post).`
                : ' A new Blogger post ID will be created and recorded.'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmMode(null)}
                className="px-4 py-2 text-xs rounded-md border border-[#E6E0D6] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeBloggerAction(confirmMode)}
                className="px-4 py-2 text-xs rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium cursor-pointer"
              >
                Confirm &amp; Execute
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4 text-xs">
          <h2 className="font-display text-xl font-bold text-[#1D221F]">
            Publishing Configuration
          </h2>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Destination Blogger Blog
            </label>
            <select
              value={selectedBlogId}
              onChange={(e) => setSelectedBlogId(e.target.value)}
              className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
            >
              {blogs.length === 0 && <option value="">No Blogger blogs loaded</option>}
              {blogs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.url})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Select Article ({articles.length} available)
            </label>
            <select
              value={selectedArticleId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSelectedArticleId(id);
                const found = articles.find((a) => a.id === id);
                if (found) setLabelsInput((found.labelsJson || []).join(', '));
              }}
              className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
            >
              {articles.length === 0 && <option value="">No articles drafted yet</option>}
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  [{a.status}] {a.title} (SEO {a.seoScore}/100)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Blogger Labels (comma separated)
            </label>
            <input
              type="text"
              value={labelsInput}
              onChange={(e) => setLabelsInput(e.target.value)}
              placeholder="Sheesham Wood, King Size Bed, Solid Wood Furniture"
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Schedule Date/Time (Optional for Scheduled Posts)
            </label>
            <input
              type="datetime-local"
              value={scheduledIso}
              onChange={(e) => setScheduledIso(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular"
            />
          </div>

          {currentArticle && (
            <div className="p-3 rounded-md bg-[#FAF8F4] border border-[#E6E0D6] space-y-1 text-[11px]">
              <div>
                <strong>SEO Score:</strong> {currentArticle.seoScore}/100 ·{' '}
                <strong>Language:</strong> {currentArticle.languageName}
              </div>
              <div>
                <strong>Existing Post ID:</strong>{' '}
                <span className="font-mono-tabular">
                  {currentArticle.bloggerPostId || 'None (New post will be created)'}
                </span>
              </div>
              {currentArticle.bloggerPostUrl && (
                <a
                  href={currentArticle.bloggerPostUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#1B4332] hover:underline inline-flex items-center gap-1 pt-1"
                >
                  <span>View Live Blogger URL</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => executeBloggerAction('draft')}
              disabled={publishing || !selectedBlogId || !currentArticle}
              className="px-3.5 py-2 rounded-md border border-[#E6E0D6] hover:bg-[#FAF8F4] disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{currentArticle?.bloggerPostId ? 'Update Draft' : 'Save Draft to Blogger'}</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmMode('schedule')}
              disabled={publishing || !selectedBlogId || !currentArticle || !scheduledIso}
              className="px-3.5 py-2 rounded-md border border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332]/5 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>Schedule</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmMode('publish')}
              disabled={publishing || !selectedBlogId || !currentArticle}
              className="px-4 py-2 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium hover:bg-[#143325] disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{currentArticle?.bloggerPostId ? 'Update & Publish' : 'Publish Live'}</span>
            </button>
          </div>
        </div>

        {/* Publishing Log */}
        <div className="lg:col-span-7 bg-white border border-[#E6E0D6] rounded-lg p-5">
          <h2 className="font-display text-xl font-bold text-[#1D221F] mb-3">
            Blogger Publishing Log
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E6E0D6] text-[#5C635E]">
                  <th className="text-left py-2 pr-2 font-medium">Article</th>
                  <th className="text-left py-2 px-2 font-medium">Blog</th>
                  <th className="text-left py-2 px-2 font-medium">Action / Status</th>
                  <th className="text-left py-2 px-2 font-medium">Post ID &amp; URL</th>
                  <th className="text-left py-2 pl-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#5C635E]">
                      No Blogger publishing events logged yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => (
                    <tr key={l.id} className="border-b border-[#F0ECE4]">
                      <td className="py-2.5 pr-2 font-medium text-[#1D221F] max-w-[180px] truncate">
                        {l.articleTitle}
                      </td>
                      <td className="py-2.5 px-2 text-[#49504B]">{l.bloggerBlogName || l.bloggerBlogId}</td>
                      <td className="py-2.5 px-2">
                        <span className={l.status === 'success' ? 'text-[#16A34A]' : 'text-[#DC2626]'}>
                          {l.action} · {l.status}
                        </span>
                        {l.errorDetails && (
                          <div className="text-[11px] text-[#DC2626] mt-0.5">{l.errorDetails}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 font-mono-tabular text-[11px]">
                        {l.postId && <div>{l.postId}</div>}
                        {l.publicUrl && (
                          <a
                            href={l.publicUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#1B4332] hover:underline"
                          >
                            Open Post
                          </a>
                        )}
                      </td>
                      <td className="py-2.5 pl-2 font-mono-tabular text-[#5C635E] whitespace-nowrap">
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Live Blogger Posts Viewer (GET /blogs/{blogId}/posts) */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-[#1D221F]">
              Existing Posts on Blogger ({currentBlog?.name || selectedBlogId || 'No Blog Selected'})
            </h2>
            <p className="text-xs text-[#5C635E]">
              Live posts, drafts, and scheduled entries retrieved directly via Blogger API v3.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={postStatusFilter}
              onChange={(e) => setPostStatusFilter(e.target.value as 'all' | 'live' | 'draft' | 'scheduled')}
              className="px-2.5 py-1.5 text-xs rounded-md border border-[#E6E0D6]"
            >
              <option value="all">All Statuses</option>
              <option value="live">Live Only</option>
              <option value="draft">Drafts Only</option>
              <option value="scheduled">Scheduled Only</option>
            </select>
            <button
              type="button"
              onClick={() => fetchBloggerPosts(selectedBlogId, postStatusFilter)}
              disabled={!isGoogleConnected || !selectedBlogId || loadingPosts}
              className="px-3 py-1.5 text-xs rounded-md border border-[#E6E0D6] hover:bg-[#FAF8F4] disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPosts ? 'animate-spin' : ''}`} />
              <span>Reload Posts</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E6E0D6] text-[#5C635E]">
                <th className="text-left py-2 pr-3 font-medium">Title</th>
                <th className="text-left py-2 px-2 font-medium">Status</th>
                <th className="text-left py-2 px-2 font-medium">Post ID</th>
                <th className="text-left py-2 px-2 font-medium">Labels</th>
                <th className="text-left py-2 px-2 font-medium">Published / Updated</th>
                <th className="text-right py-2 pl-2 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {bloggerPosts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[#5C635E]">
                    {loadingPosts
                      ? 'Fetching posts from Blogger API v3...'
                      : !isGoogleConnected
                      ? 'Authorize Google Blogger API v3 to inspect existing blog posts.'
                      : 'No Blogger posts found for the selected blog and status filter.'}
                  </td>
                </tr>
              ) : (
                bloggerPosts.map((post) => (
                  <tr key={post.id} className="border-b border-[#F0ECE4] hover:bg-[#FAF8F4]">
                    <td className="py-2.5 pr-3 font-medium text-[#1D221F] max-w-[260px] truncate">
                      {post.title}
                    </td>
                    <td className="py-2.5 px-2 font-mono-tabular">
                      <span
                        className={
                          post.status === 'LIVE'
                            ? 'text-[#16A34A]'
                            : post.status === 'SCHEDULED'
                            ? 'text-[#B68D40]'
                            : 'text-[#5C635E]'
                        }
                      >
                        {post.status || 'LIVE'}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 font-mono-tabular text-[#5C635E]">{post.id}</td>
                    <td className="py-2.5 px-2 text-[#49504B] max-w-[180px] truncate">
                      {(post.labels || []).join(', ') || '—'}
                    </td>
                    <td className="py-2.5 px-2 font-mono-tabular text-[#5C635E] whitespace-nowrap">
                      {post.published
                        ? new Date(post.published).toLocaleString()
                        : post.updated
                        ? new Date(post.updated).toLocaleString()
                        : '—'}
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      {post.url ? (
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#1B4332] hover:underline inline-flex items-center gap-1"
                        >
                          <span>View</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[#5C635E]">Draft</span>
                      )}
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
