import React, { useState } from 'react';
import { Download, Save } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { AdminProfileResponse } from '../../types/seo';

interface SettingsViewProps {
  profile: AdminProfileResponse;
  onRefreshProfile: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ profile, onRefreshProfile }) => {
  const s = profile.settings;
  const [form, setForm] = useState({
    targetDomain: s?.targetDomain || 'https://www.treewalley.com',
    amazonStoreUrl:
      s?.amazonStoreUrl ||
      'https://www.amazon.in/stores/TreeWalley/page/1DC3D299-35DD-4738-8AB4-14CCC2956151',
    sitemapUrl: s?.sitemapUrl || 'https://www.treewalley.com/sitemap.xml',
    searchConsoleSiteUrl: s?.searchConsoleSiteUrl || 'https://www.treewalley.com/',
    defaultBloggerId: s?.defaultBloggerId || '',
    defaultBloggerName: s?.defaultBloggerName || '',
    ga4PropertyId: s?.ga4PropertyId || '',
    googleAdsCustomerId: s?.googleAdsCustomerId || '',
    trendsApiApproved: s?.trendsApiApproved || false,
    minSeoScoreThreshold: s?.minSeoScoreThreshold ?? 75,
    maxDailyPublishLimit: s?.maxDailyPublishLimit ?? 5,
  });

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      await onRefreshProfile();
      setStatus('Administrator settings saved to PostgreSQL.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = async () => {
    try {
      const data = await apiFetch('/api/admin/backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `treewalley-seo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E6E0D6] pb-5">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#1D221F]">
            Platform Settings &amp; Backups
          </h1>
          <p className="mt-1 text-xs text-[#5C635E]">
            Configure TreeWalley domain properties, publishing safeguards, Google property IDs, and database backups.
          </p>
        </div>
        <button
          type="button"
          onClick={handleBackup}
          className="px-4 py-2 text-xs font-medium rounded-md border border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332]/5 flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Full JSON Backup</span>
        </button>
      </div>

      {status && (
        <div className="p-3.5 rounded-md border border-[#16A34A]/30 bg-[#F0FDF4] text-[#166534] text-xs">
          {status}
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white border border-[#E6E0D6] rounded-lg p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Authorized Single-Admin Email
            </label>
            <input
              type="text"
              value={s?.allowlistedEmail || ''}
              disabled
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] bg-[#FAF8F4] text-[#5C635E] font-mono-tabular"
            />
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Primary TreeWalley Website URL
            </label>
            <input
              type="url"
              value={form.targetDomain}
              onChange={(e) => setForm({ ...form, targetDomain: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] focus:outline-none focus:border-[#1B4332]"
            />
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              TreeWalley Amazon Storefront URL
            </label>
            <input
              type="url"
              value={form.amazonStoreUrl}
              onChange={(e) => setForm({ ...form, amazonStoreUrl: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] focus:outline-none focus:border-[#1B4332]"
            />
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              XML Sitemap URL
            </label>
            <input
              type="url"
              value={form.sitemapUrl}
              onChange={(e) => setForm({ ...form, sitemapUrl: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] focus:outline-none focus:border-[#1B4332]"
            />
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Search Console Property URL
            </label>
            <input
              type="text"
              value={form.searchConsoleSiteUrl}
              onChange={(e) => setForm({ ...form, searchConsoleSiteUrl: e.target.value })}
              placeholder="https://www.treewalley.com/ or sc-domain:treewalley.com"
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] focus:outline-none focus:border-[#1B4332]"
            />
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              GA4 Property ID (Optional)
            </label>
            <input
              type="text"
              value={form.ga4PropertyId}
              onChange={(e) => setForm({ ...form, ga4PropertyId: e.target.value })}
              placeholder="e.g. 123456789"
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] focus:outline-none focus:border-[#1B4332]"
            />
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Google Ads Customer ID (Optional)
            </label>
            <input
              type="text"
              value={form.googleAdsCustomerId}
              onChange={(e) => setForm({ ...form, googleAdsCustomerId: e.target.value })}
              placeholder="e.g. 123-456-7890"
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] focus:outline-none focus:border-[#1B4332]"
            />
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Minimum SEO Score to Publish (0–100)
            </label>
            <input
              type="number"
              min={50}
              max={100}
              value={form.minSeoScoreThreshold}
              onChange={(e) => setForm({ ...form, minSeoScoreThreshold: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular focus:outline-none focus:border-[#1B4332]"
            />
          </div>
          <div>
            <label className="block font-medium text-[#1D221F] mb-1">
              Daily Publishing Cap (Excessive Publish Guard)
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={form.maxDailyPublishLimit}
              onChange={(e) => setForm({ ...form, maxDailyPublishLimit: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-md border border-[#E6E0D6] font-mono-tabular focus:outline-none focus:border-[#1B4332]"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 text-xs font-medium rounded-md bg-[#1B4332] text-[#FAF8F4] hover:bg-[#143325] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
