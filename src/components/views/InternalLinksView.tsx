import React, { useEffect, useState } from 'react';
import { CheckCircle2, Globe, Plus, RefreshCw, ShieldCheck, Trash2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { ExternalRefRow, InternalLinkRow } from '../../types/seo';

interface InternalLinksViewProps {
  defaultSitemapUrl: string;
}

export const InternalLinksView: React.FC<InternalLinksViewProps> = ({ defaultSitemapUrl }) => {
  const [internalLinks, setInternalLinks] = useState<InternalLinkRow[]>([]);
  const [externalRefs, setExternalRefs] = useState<ExternalRefRow[]>([]);
  const [sitemapUrl, setSitemapUrl] = useState(defaultSitemapUrl);
  const [crawling, setCrawling] = useState(false);

  const [newInternal, setNewInternal] = useState({
    url: '',
    title: '',
    pageType: 'product',
    category: 'King size beds',
  });
  const [newExt, setNewExt] = useState({
    url: '',
    title: '',
    publisher: '',
    category: 'Industry Research',
  });

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLinks = async () => {
    try {
      const data = await apiFetch('/api/links');
      setInternalLinks(data.internalLinks || []);
      setExternalRefs(data.externalReferences || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadLinks();
  }, []);

  const handleCrawlSitemap = async () => {
    setCrawling(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch('/api/links/crawl-sitemap', {
        method: 'POST',
        body: JSON.stringify({ sitemapUrl }),
      });
      setMessage(
        `Scanned XML sitemap: discovered ${res.totalFound} URLs, added ${res.newlyAdded} new verified TreeWalley pages.`
      );
      await loadLinks();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCrawling(false);
    }
  };

  const handleAddInternal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/links', {
        method: 'POST',
        body: JSON.stringify(newInternal),
      });
      setNewInternal({ url: '', title: '', pageType: 'product', category: 'King size beds' });
      await loadLinks();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCheckInternal = async (id: number) => {
    try {
      await apiFetch(`/api/links/${id}/check`, { method: 'POST' });
      await loadLinks();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddExternal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/external-refs', {
        method: 'POST',
        body: JSON.stringify(newExt),
      });
      setNewExt({ url: '', title: '', publisher: '', category: 'Industry Research' });
      await loadLinks();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E6E0D6] pb-5">
        <h1 className="font-display text-3xl font-bold text-[#1D221F]">
          Internal Link Sitemap Engine &amp; External References
        </h1>
        <p className="mt-1 text-xs text-[#5C635E]">
          Syncs real TreeWalley URLs from your XML sitemap and verifies HTTP status codes so AI articles never invent or publish broken links.
        </p>
      </div>

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

      {/* XML Sitemap Scanner */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 flex flex-col sm:flex-row sm:items-end gap-3 text-xs">
        <div className="flex-1">
          <label className="block font-medium text-[#1D221F] mb-1">
            TreeWalley XML Sitemap URL
          </label>
          <input
            type="url"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular"
          />
        </div>
        <button
          type="button"
          onClick={handleCrawlSitemap}
          disabled={crawling}
          className="px-5 py-2 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium hover:bg-[#143325] disabled:opacity-50 flex items-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${crawling ? 'animate-spin' : ''}`} />
          <span>{crawling ? 'Scanning Sitemap...' : 'Scan XML Sitemap'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Internal Links Database */}
        <div className="lg:col-span-7 bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4">
          <h2 className="font-display text-xl font-bold text-[#1D221F]">
            Verified Internal Links ({internalLinks.length})
          </h2>

          <form onSubmit={handleAddInternal} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            <input
              type="url"
              value={newInternal.url}
              onChange={(e) => setNewInternal({ ...newInternal, url: e.target.value })}
              placeholder="https://www.treewalley.com/..."
              required
              className="sm:col-span-2 px-2.5 py-2 rounded-md border border-[#E6E0D6]"
            />
            <input
              type="text"
              value={newInternal.title}
              onChange={(e) => setNewInternal({ ...newInternal, title: e.target.value })}
              placeholder="Anchor / Page Title"
              required
              className="px-2.5 py-2 rounded-md border border-[#E6E0D6]"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>

          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E6E0D6] text-[#5C635E]">
                  <th className="text-left py-2 font-medium">Page &amp; URL</th>
                  <th className="text-left py-2 px-2 font-medium">Type</th>
                  <th className="text-right py-2 px-2 font-medium">HTTP</th>
                  <th className="text-right py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {internalLinks.map((lnk) => (
                  <tr key={lnk.id} className="border-b border-[#F0ECE4]">
                    <td className="py-2.5 pr-2 max-w-[260px]">
                      <div className="font-medium text-[#1D221F] truncate">{lnk.title}</div>
                      <div className="text-[11px] text-[#1B4332] font-mono-tabular truncate">{lnk.url}</div>
                    </td>
                    <td className="py-2.5 px-2 text-[#5C635E] capitalize">{lnk.pageType}</td>
                    <td className="py-2.5 px-2 text-right font-mono-tabular">
                      {lnk.httpStatus === null ? (
                        <span className="text-[#5C635E]">Untested</span>
                      ) : lnk.httpStatus >= 200 && lnk.httpStatus < 400 ? (
                        <span className="text-[#16A34A]">{lnk.httpStatus}</span>
                      ) : (
                        <span className="text-[#DC2626]">{lnk.httpStatus || 'ERR'}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleCheckInternal(lnk.id)}
                        className="text-[#1B4332] hover:underline mr-2 cursor-pointer"
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/links/${lnk.id}`, { method: 'DELETE' });
                          await loadLinks();
                        }}
                        className="text-[#DC2626] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Authoritative External References */}
        <div className="lg:col-span-5 bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4">
          <h2 className="font-display text-xl font-bold text-[#1D221F] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#1B4332]" />
            <span>Approved External References</span>
          </h2>

          <form onSubmit={handleAddExternal} className="space-y-2 text-xs">
            <input
              type="url"
              value={newExt.url}
              onChange={(e) => setNewExt({ ...newExt, url: e.target.value })}
              placeholder="https://www.bis.gov.in/..."
              required
              className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={newExt.title}
                onChange={(e) => setNewExt({ ...newExt, title: e.target.value })}
                placeholder="Publication Title"
                required
                className="px-2.5 py-2 rounded-md border border-[#E6E0D6]"
              />
              <input
                type="text"
                value={newExt.publisher}
                onChange={(e) => setNewExt({ ...newExt, publisher: e.target.value })}
                placeholder="Publisher / Authority"
                required
                className="px-2.5 py-2 rounded-md border border-[#E6E0D6]"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 rounded-md border border-[#1B4332] text-[#1B4332] font-medium hover:bg-[#1B4332]/5 cursor-pointer"
            >
              Add &amp; Verify Credible Source
            </button>
          </form>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto text-xs">
            {externalRefs.map((ref) => (
              <div key={ref.id} className="p-3 border border-[#E6E0D6] rounded-md space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-[#1D221F]">{ref.title}</div>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/external-refs/${ref.id}`, { method: 'DELETE' });
                      await loadLinks();
                    }}
                    className="text-[#DC2626] shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-[11px] text-[#6F4E37]">
                  {ref.publisher} · {ref.category}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-mono-tabular text-[#5C635E] truncate max-w-[200px]">
                    {ref.url}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/external-refs/${ref.id}/check`, { method: 'POST' });
                      await loadLinks();
                    }}
                    className="text-[#1B4332] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {ref.httpStatus && ref.httpStatus >= 200 && ref.httpStatus < 400 ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
                    ) : ref.httpStatus !== null ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-[#DC2626]" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}
                    <span>{ref.httpStatus ? `HTTP ${ref.httpStatus}` : 'Test'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
