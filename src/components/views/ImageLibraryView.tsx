import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Globe, ImagePlus, Sparkles, Trash2, Upload } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { MediaAsset } from '../../types/seo';

const MEDIA_CATEGORIES = [
  'All',
  'Wooden beds',
  'King size beds',
  'Queen size beds',
  'Storage beds',
  'Wooden wardrobes',
  'Wooden almari',
  'Coffee tables',
  'Cabinets',
  'Sofas',
  'Dining tables',
  'TV units',
];

export const ImageLibraryView: React.FC = () => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [filterCat, setFilterCat] = useState('All');
  const [uploadCategory, setUploadCategory] = useState('Wooden beds');
  const [isTreeWalleyProduct, setIsTreeWalleyProduct] = useState(true);
  const [productUrl, setProductUrl] = useState('https://www.treewalley.com/');
  const [maxWidth, setMaxWidth] = useState(1200);
  const [aiPrompt, setAiPrompt] = useState(
    'Warm sunlit Indian living room with a solid Sheesham wood TV unit and brass decor'
  );
  const [uploading, setUploading] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMedia = async () => {
    try {
      const data = await apiFetch('/api/media');
      setAssets(data.media || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadMedia();
  }, []);

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('files', f));
      formData.append('category', uploadCategory);
      formData.append('isTreeWalleyProduct', String(isTreeWalleyProduct));
      formData.append('productUrl', productUrl);
      formData.append('maxWidth', String(maxWidth));

      const res = await apiFetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      });
      setMessage(
        `Uploaded & optimized ${res.assets.length} image(s) to WebP with AI SEO filenames and ALT text.`
      );
      await loadMedia();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleAiGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingAi(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch('/api/media/generate-ai', {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt, category: uploadCategory }),
      });
      setMessage(`Generated generic inspiration WebP asset: ${res.asset.seoFilename}`);
      await loadMedia();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleVerifyPublic = async (id: number) => {
    try {
      const res = await apiFetch(`/api/media/${id}/verify`, { method: 'POST' });
      setMessage(`Verified public HTTPS accessibility: HTTP ${res.httpStatus} (${res.fullUrl})`);
      await loadMedia();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/media/${id}`, { method: 'DELETE' });
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filtered =
    filterCat === 'All' ? assets : assets.filter((a) => a.category === filterCat);

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E6E0D6] pb-5">
        <h1 className="font-display text-3xl font-bold text-[#1D221F]">
          Automatic Image Library &amp; WebP Optimizer
        </h1>
        <p className="mt-1 text-xs text-[#5C635E]">
          Upload authentic TreeWalley product photography for automatic WebP compression, resizing, SEO naming, and ALT generation. Generic inspiration images are strictly separated from product photos.
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Product Image Uploader */}
        <div className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4 text-xs">
          <h2 className="font-display text-xl font-bold text-[#1D221F]">
            Upload &amp; Convert Product Images to WebP
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Furniture Category</label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md border border-[#E6E0D6]"
              >
                {MEDIA_CATEGORIES.filter((c) => c !== 'All').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Max Resize Width (px)</label>
              <input
                type="number"
                min={400}
                max={2000}
                value={maxWidth}
                onChange={(e) => setMaxWidth(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isTreeWalleyProduct}
                onChange={(e) => setIsTreeWalleyProduct(e.target.checked)}
                className="accent-[#1B4332]"
              />
              <span>Authentic TreeWalley Product Photo</span>
            </label>
            <input
              type="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="Associated TreeWalley product URL"
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
            />
          </div>

          <label className="flex flex-col items-center justify-center border border-dashed border-[#1B4332]/40 rounded-md p-6 bg-[#FAF8F4] hover:bg-[#F3EFE6] cursor-pointer transition-colors">
            <Upload className="w-6 h-6 text-[#1B4332] mb-2" />
            <span className="font-medium text-[#1D221F]">
              {uploading ? 'Optimizing & Generating SEO Alt Text...' : 'Click to Upload Single or Multiple Product Images'}
            </span>
            <span className="text-[11px] text-[#5C635E] mt-1">
              JPG, PNG, or WebP · Automatically resized, compressed &amp; served over HTTPS
            </span>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleUploadFiles}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {/* Generic Interior Inspiration Generator */}
        <form
          onSubmit={handleAiGenerate}
          className="bg-white border border-[#E6E0D6] rounded-lg p-5 space-y-4 text-xs flex flex-col justify-between"
        >
          <div className="space-y-3">
            <h2 className="font-display text-xl font-bold text-[#1D221F] flex items-center gap-2">
              <ImagePlus className="w-5 h-5 text-[#B68D40]" />
              <span>AI Generic Inspiration Image (Optional)</span>
            </h2>
            <p className="text-[#5C635E] leading-relaxed">
              Use only for generic interior design inspiration—never alter actual TreeWalley product designs or misrepresent generic inspiration as a specific TreeWalley SKU.
            </p>
            <div>
              <label className="block font-medium text-[#1D221F] mb-1">Scene Description</label>
              <textarea
                rows={3}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[#E6E0D6]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={generatingAi}
            className="w-full py-2.5 px-4 rounded-md border border-[#1B4332] text-[#1B4332] font-medium hover:bg-[#1B4332]/5 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{generatingAi ? 'Generating WebP Inspiration...' : 'Generate Generic Inspiration Image'}</span>
          </button>
        </form>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-1.5">
        {MEDIA_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilterCat(cat)}
            className={`px-3 py-1.5 text-xs rounded-md border cursor-pointer whitespace-nowrap ${
              filterCat === cat
                ? 'bg-[#1B4332] text-[#FAF8F4] border-[#1B4332]'
                : 'bg-white text-[#49504B] border-[#E6E0D6]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Gallery Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filtered.map((item) => (
          <div key={item.id} className="bg-white border border-[#E6E0D6] rounded-lg overflow-hidden flex flex-col">
            <div className="aspect-[4/3] bg-[#EFECE5] overflow-hidden">
              <img
                src={item.webpUrl || item.publicUrl}
                alt={item.altText}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-4 flex-1 flex flex-col justify-between text-xs space-y-3">
              <div>
                <div className="font-semibold text-[#1D221F] truncate" title={item.seoFilename}>
                  {item.seoFilename}
                </div>
                <div className="text-[11px] text-[#6F4E37] mt-0.5">
                  {item.category} · {item.isTreeWalleyProduct ? 'TreeWalley Product' : 'Generic Inspiration'}
                </div>
                <p className="text-[11px] text-[#49504B] mt-2 line-clamp-2" title={item.altText}>
                  ALT: {item.altText}
                </p>
                <div className="text-[11px] font-mono-tabular text-[#5C635E] mt-1.5">
                  {item.width}×{item.height}px · {(item.sizeBytes / 1024).toFixed(0)} KB ·{' '}
                  <span className={item.publicVerified ? 'text-[#16A34A]' : 'text-[#DC2626]'}>
                    {item.publicVerified ? 'HTTPS Verified' : 'Unverified'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#F0ECE4]">
                <button
                  type="button"
                  onClick={() => handleVerifyPublic(item.id)}
                  className="text-[#1B4332] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {item.publicVerified ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                  <span>Verify URL</span>
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(item.webpUrl || item.publicUrl);
                      setMessage(`Copied image path: ${item.webpUrl || item.publicUrl}`);
                    }}
                    className="text-[#5C635E] hover:text-[#1D221F] cursor-pointer"
                    title="Copy URL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="text-[#DC2626] hover:opacity-75 cursor-pointer"
                    title="Delete asset"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
