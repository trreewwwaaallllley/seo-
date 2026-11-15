import React from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Calendar,
  FileSpreadsheet,
  Globe,
  Image as ImageIcon,
  KeyRound,
  Layers,
  LayoutDashboard,
  Link2,
  SearchCheck,
  Send,
  Settings,
  TrendingUp,
  X,
} from 'lucide-react';
import { SidebarModuleId } from '../types/seo';

export const SIDEBAR_ITEMS: Array<{
  id: SidebarModuleId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Intelligence' },
  { id: 'trends', label: 'Google Search Trends', icon: TrendingUp, group: 'Intelligence' },
  { id: 'keywords', label: 'Keyword Research', icon: KeyRound, group: 'Intelligence' },
  { id: 'rank-tracker', label: 'Rank Tracker', icon: BarChart3, group: 'Intelligence' },
  { id: 'blog-writer', label: 'Blog Writer', icon: BookOpen, group: 'Editorial & Assets' },
  { id: 'bulk-generator', label: 'Bulk Blog Generator', icon: Layers, group: 'Editorial & Assets' },
  { id: 'image-library', label: 'Image Library', icon: ImageIcon, group: 'Editorial & Assets' },
  { id: 'internal-links', label: 'Internal Links', icon: Link2, group: 'Editorial & Assets' },
  { id: 'blogger-publisher', label: 'Blogger Publisher', icon: Send, group: 'Publishing' },
  { id: 'content-calendar', label: 'Content Calendar', icon: Calendar, group: 'Publishing' },
  { id: 'index-monitor', label: 'Google Index Monitor', icon: SearchCheck, group: 'Governance & Reports' },
  { id: 'seo-audit', label: 'SEO Audit', icon: Activity, group: 'Governance & Reports' },
  { id: 'export-reports', label: 'Export Reports', icon: FileSpreadsheet, group: 'Governance & Reports' },
  { id: 'google-connections', label: 'Google Connections', icon: Globe, group: 'Administration' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'Administration' },
];

interface SidebarProps {
  activeModule: SidebarModuleId;
  onSelect: (id: SidebarModuleId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  adminEmail: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelect,
  mobileOpen,
  onCloseMobile,
  adminEmail,
}) => {
  const groups = ['Intelligence', 'Editorial & Assets', 'Publishing', 'Governance & Reports', 'Administration'];

  const navContent = (
    <div className="h-full flex flex-col bg-[#133124] text-[#E9EFEA] w-64 shrink-0 border-r border-[#224A38]">
      <div className="px-5 py-5 border-b border-[#224A38] flex items-center justify-between">
        <div>
          <div className="font-display text-xl font-bold tracking-tight text-[#FAF8F4] whitespace-nowrap">
            TreeWalley
          </div>
          <div className="text-[11px] text-[#D4AF6A] tracking-wide whitespace-nowrap">
            SEO Command Center
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-[#D8E2DC] hover:text-white cursor-pointer"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groups.map((group) => {
          const items = SIDEBAR_ITEMS.filter((i) => i.group === group);
          return (
            <div key={group}>
              <div className="px-2.5 mb-1.5 text-[11px] font-medium tracking-wider text-[#95B2A2]">
                {group}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = activeModule === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelect(item.id);
                        onCloseMobile();
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-[#1F513B] text-[#FAF8F4] border border-[#C9A24D]/40'
                          : 'text-[#C8D8CE] hover:bg-[#193E2E] hover:text-[#FAF8F4] border border-transparent'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#D4AF6A]' : 'text-[#8FAE9D]'}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="px-4 py-3.5 border-t border-[#224A38] text-[11px] text-[#A8C0B2]">
        <div className="font-medium text-[#FAF8F4] truncate">{adminEmail}</div>
        <div className="mt-0.5 text-[#95B2A2]">Private Single-Admin Workspace</div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block h-screen sticky top-0 shrink-0">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/50" onClick={onCloseMobile} />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
};
