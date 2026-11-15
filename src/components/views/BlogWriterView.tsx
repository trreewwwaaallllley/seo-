import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileCode,
  Send,
  Sparkles,
  Save,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { LANGUAGES_350 } from '../../data/languages';
import { Article, InternalLinkRow, MediaAsset } from '../../types/seo';

const BLOG_MODES = [
  'SEO Buying Guide',
  'Furniture Magazine Article',
  'Product Category Article',
  'Product Comparison Article',
  'Furniture Design Inspiration',
  'Furniture Care Guide',
  'Brand History Article',
  'Educational Article',
  'Festival and Promotional Article',
  'News and Industry Article',
];

const WRITING_STYLES = [
  'Premium editorial',
  'Professional',
  'Friendly',
  'Research-based',
  'Conversational',
  'Luxury furniture magazine',
];

const BLOG_CATEGORIES = [
  'Wooden beds',
  'King size beds',
  'Queen size beds',
  'Storage beds',
  'Wooden wardrobes',
  'Wooden almari',
  'Coffee tables',
  'Cabinets',
  'Dining tables',
  'TV units',
  'Solid wood furniture',
];

interface BlogWriterViewProps {
  initialPrefill?: { topic: string; keyword: string; category?: string } | null;
  onClearPrefill: () => void;
  onOpenInBlogger: (articleId: number) => void;
}

export const BlogWriterView: React.FC<BlogWriterViewProps> = ({
  initialPrefill,
  onClearPrefill,
  onOpenInBlogger,
}) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [internalLinks, setInternalLinks] = useState<InternalLinkRow[]>([]);

  const [topic, setTopic] = useState(
    'How to Choose a Solid Sheesham Wood King Size Bed for Indian Bedrooms'
  );
  const [primaryKeyword, setPrimaryKeyword] = useState('sheesham wood king size bed');
  const [secondaryKeywords, setSecondaryKeywords] = useState(
    'solid wood bed india, wooden bed with box storage, rosewood bedroom furniture'
  );
  const [targetCountry, setTargetCountry] = useState('India');
  const [targetAudience, setTargetAudience] = useState(
    'Indian homeowners seeking heirloom solid wood bedroom furniture'
  );
  const [languageSearch, setLanguageSearch] = useState('');
  const [languageCode, setLanguageCode] = useState('en-IN');
  const [wordCount, setWordCount] = useState(1200);
  const [mode, setMode] = useState(BLOG_MODES[0]);
  const [writingStyle, setWritingStyle] = useState(WRITING_STYLES[0]);
  const [blogCategory, setBlogCategory] = useState(BLOG_CATEGORIES[1]);
  const [productLinks, setProductLinks] = useState(
    'https://www.treewalley.com/\nhttps://www.amazon.in/stores/TreeWalley/page/1DC3D299-35DD-4738-8AB4-14CCC2956151'
  );
  const [selectedMediaIds, setSelectedMediaIds] = useState<number[]>([]);
  const [selectedInternalUrls, setSelectedInternalUrls] = useState<string[]>([]);

  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'html'>('preview');
  const [generating, setGenerating] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialPrefill) {
      setTopic(initialPrefill.topic);
      setPrimaryKeyword(initialPrefill.keyword);
      if (initialPrefill.category) setBlogCategory(initialPrefill.category);
      onClearPrefill();
    }
  }, [initialPrefill]);

  const loadWorkspace = async () => {
    try {
      const [artRes, mediaRes, linksRes] = await Promise.all([
        apiFetch('/api/articles'),
        apiFetch('/api/media'),
        apiFetch('/api/links'),
      ]);
      setArticles(artRes.articles || []);
      setMedia(mediaRes.media || []);
      setInternalLinks(linksRes.internalLinks || []);
      if (artRes.articles?.length > 0 && !activeArticle) {
        setActiveArticle(artRes.articles[0]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  const filteredLanguages = useMemo(() => {
    const q = languageSearch.trim().toLowerCase();
    if (!q) return LANGUAGES_350.slice(0, 60);
    return LANGUAGES_350.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q) ||
        l.region.toLowerCase().includes(q)
    ).slice(0, 80);
  }, [languageSearch]);

  const selectedLang = useMemo(
    () => LANGUAGES_350.find((l) => l.code === languageCode) || LANGUAGES_350[0],
    [languageCode]
  );

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch('/api/articles/generate', {
        method: 'POST',
        body: JSON.stringify({
          topic,
          primaryKeyword,
          secondaryKeywords,
          targetCountry,
          targetAudience,
          languageCode,
          regionalVariation: selectedLang.region,
          wordCount,
          mode,
          writingStyle,
          blogCategory,
          productLinks,
          selectedMediaIds,
          internalLinks: selectedInternalUrls,
        }),
      });
      setActiveArticle(res.article);
      await loadWorkspace();
      setNotice(
        `Generated "${res.article.title}" in ${selectedLang.name} · SEO Score: ${res.article.seoScore}/100`
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateManualDraft = async () => {
    setCreatingDraft(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch('/api/articles/draft', {
        method: 'POST',
        body: JSON.stringify({
          topic,
          primaryKeyword,
          secondaryKeywords,
          targetCountry,
          targetAudience,
          languageCode,
          regionalVariation: selectedLang.region,
          wordCount,
          mode,
          writingStyle,
          blogCategory,
          productLinks,
          selectedMediaIds,
          internalLinks: selectedInternalUrls,
        }),
      });
      setActiveArticle(res.article);
      await loadWorkspace();
      setNotice(
        `Created structured free draft "${res.article.title}" with selected WebP images & verified links (SEO Score: ${res.article.seoScore}/100). Edit below and publish to Blogger.`
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingDraft(false);
    }
  };

  const handleSaveEdit = async (nextStatus?: Article['status']) => {
    if (!activeArticle) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/articles/${activeArticle.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: activeArticle.title,
          seoTitle: activeArticle.seoTitle,
          slug: activeArticle.slug,
          metaDescription: activeArticle.metaDescription,
          primaryKeyword: activeArticle.primaryKeyword,
          contentHtml: activeArticle.contentHtml,
          status: nextStatus ?? activeArticle.status,
        }),
      });
      setActiveArticle(res.article);
      await loadWorkspace();
      setNotice(`Article saved (${res.article.status}) · SEO Quality Score: ${res.article.seoScore}/100`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/articles/${id}`, { method: 'DELETE' });
      const remaining = articles.filter((a) => a.id !== id);
      setArticles(remaining);
      if (activeArticle?.id === id) {
        setActiveArticle(remaining[0] || null);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E6E0D6] pb-5">
        <h1 className="font-display text-3xl font-bold text-[#1D221F]">
          AI Blog Writer &amp; Multilingual Studio
        </h1>
        <p className="mt-1 text-xs text-[#5C635E]">
          Supports 350+ languages and regional variations with non-literal keyword localization, real TreeWalley assets, and 0–100 SEO quality control.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-md border border-[#16A34A]/30 bg-[#F0FDF4] text-[#166534] text-xs">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Generation Configuration Panel */}
        <form
          onSubmit={handleGenerate}
          className="xl:col-span-4 bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4 text-xs"
        >
          <h2 className="font-display text-xl font-bold text-[#1D221F]">
            Article Brief
          </h2>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1">Blog Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Primary Keyword</label>
              <input
                type="text"
                value={primaryKeyword}
                onChange={(e) => setPrimaryKeyword(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Category</label>
              <select
                value={blogCategory}
                onChange={(e) => setBlogCategory(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
              >
                {BLOG_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Secondary Keywords (comma separated)
            </label>
            <input
              type="text"
              value={secondaryKeywords}
              onChange={(e) => setSecondaryKeywords(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Article Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
              >
                {BLOG_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Writing Style</label>
              <select
                value={writingStyle}
                onChange={(e) => setWritingStyle(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
              >
                {WRITING_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Searchable 350-language Selector */}
          <div className="p-3 border border-[#E6E0D6] rounded-md bg-[#FAF8F4] space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-medium text-[#1D221F]">
                Language ({LANGUAGES_350.length} supported)
              </label>
              <span
                className={`text-[11px] font-medium ${
                  selectedLang.reliability === 'High'
                    ? 'text-[#16A34A]'
                    : selectedLang.reliability === 'Good'
                    ? 'text-[#B68D40]'
                    : 'text-[#DC2626]'
                }`}
              >
                Model Reliability: {selectedLang.reliability}
              </span>
            </div>
            <input
              type="text"
              value={languageSearch}
              onChange={(e) => setLanguageSearch(e.target.value)}
              placeholder="Search Hindi, Tamil, Arabic, French, Marwari..."
              className="w-full px-2.5 py-1.5 rounded-md border border-[#E6E0D6] bg-white"
            />
            <select
              value={languageCode}
              onChange={(e) => setLanguageCode(e.target.value)}
              className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6] bg-white"
            >
              {filteredLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name} — {lang.nativeName} ({lang.region}) [{lang.reliability}]
                </option>
              ))}
            </select>
            {selectedLang.reliability === 'Review Recommended' && (
              <p className="text-[11px] text-[#B45309]">
                Note: This regional/low-resource language requires native editorial review prior to Blogger publication.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Target Country</label>
              <input
                type="text"
                value={targetCountry}
                onChange={(e) => setTargetCountry(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Target Word Count</label>
              <input
                type="number"
                min={500}
                max={3500}
                step={100}
                value={wordCount}
                onChange={(e) => setWordCount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1">Target Audience</label>
            <input
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Product / Storefront Links
            </label>
            <textarea
              rows={2}
              value={productLinks}
              onChange={(e) => setProductLinks(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular text-[11px]"
            />
          </div>

          {/* Image Attachment Selector */}
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Select Images from Library ({selectedMediaIds.length} selected)
            </label>
            <div className="grid grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1">
              {media.map((img) => {
                const chosen = selectedMediaIds.includes(img.id);
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() =>
                      setSelectedMediaIds((prev) =>
                        prev.includes(img.id) ? prev.filter((x) => x !== img.id) : [...prev, img.id]
                      )
                    }
                    className={`border rounded overflow-hidden cursor-pointer ${
                      chosen ? 'border-[#1B4332] ring-2 ring-[#1B4332]' : 'border-[#E6E0D6]'
                    }`}
                    title={img.altText}
                  >
                    <img
                      src={img.webpUrl || img.publicUrl}
                      alt={img.altText}
                      referrerPolicy="no-referrer"
                      className="w-full h-12 object-cover"
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Internal Links Multi-select */}
          {internalLinks.length > 0 && (
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">
                Verified Internal Links ({selectedInternalUrls.length} chosen, auto-selects if empty)
              </label>
              <div className="max-h-28 overflow-y-auto border border-[#E6E0D6] rounded-md p-2 space-y-1">
                {internalLinks.slice(0, 15).map((lnk) => (
                  <label key={lnk.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedInternalUrls.includes(lnk.url)}
                      onChange={(e) =>
                        setSelectedInternalUrls((prev) =>
                          e.target.checked ? [...prev, lnk.url] : prev.filter((u) => u !== lnk.url)
                        )
                      }
                      className="accent-[#1B4332]"
                    />
                    <span className="truncate">{lnk.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <button
              type="submit"
              disabled={generating || creatingDraft}
              className="w-full py-2.5 px-4 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium hover:bg-[#143325] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{generating ? 'Composing Multilingual SEO Article...' : 'Generate SEO Article'}</span>
            </button>
            <button
              type="button"
              onClick={handleCreateManualDraft}
              disabled={generating || creatingDraft}
              className="w-full py-2 px-4 rounded-md border border-[#E6E0D6] text-[#1D221F] font-medium hover:bg-[#FAF8F4] disabled:opacity-50 cursor-pointer"
            >
              {creatingDraft ? 'Creating Structured Draft...' : 'Create Structured Draft (Free · No AI Quota)'}
            </button>
          </div>
        </form>

        {/* Editorial Workspace & Quality Control */}
        <div className="xl:col-span-8 space-y-5">
          {/* Saved Drafts Switcher */}
          <div className="bg-white border border-[#E6E0D6] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-[220px]">
              <label className="text-xs font-medium text-[#5C635E] whitespace-nowrap">
                Drafts ({articles.length}):
              </label>
              <select
                value={activeArticle?.id || ''}
                onChange={(e) => {
                  const found = articles.find((a) => a.id === Number(e.target.value));
                  if (found) setActiveArticle(found);
                }}
                className="flex-1 max-w-md px-2.5 py-1.5 text-xs border border-[#E6E0D6] rounded-md"
              >
                {articles.length === 0 && <option value="">No drafts yet</option>}
                {articles.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.status}] {a.title} ({a.languageName} · {a.seoScore}/100)
                  </option>
                ))}
              </select>
            </div>

            {activeArticle && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`px-3 py-1.5 text-xs rounded-md border flex items-center gap-1 cursor-pointer ${
                    viewMode === 'preview' ? 'bg-[#1B4332] text-white border-[#1B4332]' : 'border-[#E6E0D6]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('html')}
                  className={`px-3 py-1.5 text-xs rounded-md border flex items-center gap-1 cursor-pointer ${
                    viewMode === 'html' ? 'bg-[#1B4332] text-white border-[#1B4332]' : 'border-[#E6E0D6]'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>HTML</span>
                </button>
              </div>
            )}
          </div>

          {activeArticle ? (
            <div className="bg-white border border-[#E6E0D6] rounded-lg p-6 space-y-5">
              {/* SEO Metadata Editor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pb-5 border-b border-[#E6E0D6]">
                <div className="md:col-span-2">
                  <label className="block font-medium text-[#5C635E] mb-1">Blog Title (H1)</label>
                  <input
                    type="text"
                    value={activeArticle.title}
                    onChange={(e) =>
                      setActiveArticle({ ...activeArticle, title: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-display text-lg font-bold text-[#1D221F]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#5C635E] mb-1">
                    Separate SEO Title Tag ({activeArticle.seoTitle.length} chars)
                  </label>
                  <input
                    type="text"
                    value={activeArticle.seoTitle}
                    onChange={(e) =>
                      setActiveArticle({ ...activeArticle, seoTitle: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#5C635E] mb-1">SEO Slug</label>
                  <input
                    type="text"
                    value={activeArticle.slug}
                    onChange={(e) =>
                      setActiveArticle({ ...activeArticle, slug: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block font-medium text-[#5C635E] mb-1">
                    Meta Description ({activeArticle.metaDescription.length} chars)
                  </label>
                  <textarea
                    rows={2}
                    value={activeArticle.metaDescription}
                    onChange={(e) =>
                      setActiveArticle({ ...activeArticle, metaDescription: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
                  />
                </div>
                <div className="md:col-span-2 flex flex-wrap items-center gap-3 text-[11px] text-[#5C635E]">
                  <span>Language: {activeArticle.languageName}</span>
                  <span>·</span>
                  <span>Words: {activeArticle.wordCountActual}</span>
                  <span>·</span>
                  <span>Status: {activeArticle.status}</span>
                  <span>·</span>
                  <span>SEO Content Score: {activeArticle.seoScore}/100 (Quality check only; does not guarantee ranking)</span>
                </div>
              </div>

              {/* Warnings */}
              {activeArticle.cannibalizationWarning && (
                <div className="p-3 rounded-md border border-[#D97706]/40 bg-[#FFFBEB] text-[#92400E] text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{activeArticle.cannibalizationWarning}</span>
                </div>
              )}

              {/* Preview or HTML */}
              {viewMode === 'preview' ? (
                <div
                  className="editorial-prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: activeArticle.contentHtml }}
                />
              ) : (
                <textarea
                  rows={18}
                  value={activeArticle.contentHtml}
                  onChange={(e) =>
                    setActiveArticle({ ...activeArticle, contentHtml: e.target.value })
                  }
                  className="w-full p-3 rounded-md border border-[#E6E0D6] font-mono-tabular text-xs"
                />
              )}

              {/* FAQ Section */}
              {activeArticle.faqJson?.length > 0 && (
                <div className="pt-5 border-t border-[#E6E0D6]">
                  <h3 className="font-display text-lg font-bold text-[#1D221F] mb-3">
                    Article FAQ Schema Section
                  </h3>
                  <div className="space-y-3 text-xs">
                    {activeArticle.faqJson.map((f, i) => (
                      <div key={i} className="p-3 bg-[#FAF8F4] rounded-md border border-[#E6E0D6]">
                        <div className="font-semibold text-[#1D221F]">{f.question}</div>
                        <div className="text-[#49504B] mt-1 leading-relaxed">{f.answer}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SEO Quality Control Checklist */}
              {activeArticle.seoAuditJson && (
                <div className="pt-5 border-t border-[#E6E0D6]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display text-lg font-bold text-[#1D221F]">
                      SEO Quality Control ({activeArticle.seoScore}/100)
                    </h3>
                    <span className="text-[11px] text-[#5C635E]">
                      10-point structural &amp; link validation
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                    {activeArticle.seoAuditJson.checks.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-start gap-2 p-2.5 rounded-md border border-[#E6E0D6]"
                      >
                        {c.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-medium text-[#1D221F]">{c.label}</div>
                          <div className="text-[11px] text-[#5C635E]">{c.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Bar */}
              <div className="pt-4 border-t border-[#E6E0D6] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDelete(activeArticle.id)}
                    className="px-3 py-2 text-xs text-[#DC2626] border border-[#DC2626]/30 rounded-md hover:bg-[#FEF2F2] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                  {activeArticle.status === 'published' && (
                    <a
                      href={`/public/article/${activeArticle.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 text-xs text-[#1B4332] border border-[#E6E0D6] rounded-md hover:bg-[#FAF8F4] flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Public URL</span>
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveEdit('draft')}
                    disabled={saving}
                    className="px-4 py-2 text-xs font-medium rounded-md border border-[#E6E0D6] hover:bg-[#FAF8F4] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save &amp; Re-Score</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEdit('approved')}
                    disabled={saving}
                    className="px-4 py-2 text-xs font-medium rounded-md border border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332]/5 cursor-pointer"
                  >
                    Mark Approved
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenInBlogger(activeArticle.id)}
                    className="px-4 py-2 text-xs font-medium rounded-md bg-[#1B4332] text-[#FAF8F4] hover:bg-[#143325] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Publish in Blogger</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#E6E0D6] rounded-lg p-12 text-center text-xs text-[#5C635E]">
              Configure your brief on the left and click &ldquo;Generate SEO Article&rdquo; to compose your first multilingual furniture article.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
