import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { LogOut, Menu } from 'lucide-react';
import { auth, signOutAdmin } from './lib/firebase';
import { apiFetch } from './lib/api';
import { AdminProfileResponse, SidebarModuleId } from './types/seo';
import { LoginScreen } from './components/LoginScreen';
import { SIDEBAR_ITEMS, Sidebar } from './components/Sidebar';
import { OverviewView } from './components/views/OverviewView';
import { TrendsView } from './components/views/TrendsView';
import { KeywordResearchView } from './components/views/KeywordResearchView';
import { RankTrackerView } from './components/views/RankTrackerView';
import { BlogWriterView } from './components/views/BlogWriterView';
import { BulkGeneratorView } from './components/views/BulkGeneratorView';
import { ImageLibraryView } from './components/views/ImageLibraryView';
import { InternalLinksView } from './components/views/InternalLinksView';
import { BloggerPublisherView } from './components/views/BloggerPublisherView';
import { ContentCalendarView } from './components/views/ContentCalendarView';
import { IndexMonitorView } from './components/views/IndexMonitorView';
import { SeoAuditView } from './components/views/SeoAuditView';
import { ExportReportsView } from './components/views/ExportReportsView';
import { GoogleConnectionsView } from './components/views/GoogleConnectionsView';
import { SettingsView } from './components/views/SettingsView';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<AdminProfileResponse | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [serviceUnavailableError, setServiceUnavailableError] = useState<string | null>(null);

  const [activeModule, setActiveModule] = useState<SidebarModuleId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [writerPrefill, setWriterPrefill] = useState<{
    topic: string;
    keyword: string;
    category?: string;
  } | null>(null);
  const [bloggerArticleId, setBloggerArticleId] = useState<number | null>(null);

  const fetchAdminProfile = async () => {
    try {
      setAuthError(null);
      setServiceUnavailableError(null);
      const data = await apiFetch<AdminProfileResponse>('/api/admin/me');
      sessionStorage.removeItem('tw_project_reload');
      setProfile(data);
    } catch (err: any) {
      const msg = err?.message || 'Administrator verification failed.';
      setProfile(null);
      if (err?.code === 'DATABASE_UNAVAILABLE' || err?.status === 503) {
        setServiceUnavailableError(msg);
        return;
      }
      setAuthError(msg);
      await signOutAdmin().catch(() => null);
      if (
        (err?.code === 'PROJECT_MISMATCH' || msg.includes('previous Firebase project')) &&
        !sessionStorage.getItem('tw_project_reload')
      ) {
        sessionStorage.setItem('tw_project_reload', '1');
        window.location.reload();
      }
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await fetchAdminProfile();
      } else {
        setProfile(null);
        setServiceUnavailableError(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#FAF8F4] flex items-center justify-center text-xs text-[#5C635E]">
        Verifying TreeWalley administrator session...
      </div>
    );
  }

  if (firebaseUser && serviceUnavailableError && !profile) {
    return (
      <div className="min-h-screen bg-[#FAF8F4] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-[#E6E0D6] rounded-lg p-7">
          <div className="text-xs tracking-[0.14em] text-[#B45309] font-medium mb-2">
            WORKSPACE TEMPORARILY UNAVAILABLE
          </div>
          <h1 className="font-display text-2xl font-bold text-[#1D221F] mb-3">
            Unable to Load Administrator Workspace
          </h1>
          <p className="text-sm text-[#49504B] leading-relaxed mb-6">
            {serviceUnavailableError}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fetchAdminProfile()}
              className="px-4 py-2 text-xs font-medium rounded-md bg-[#1B4332] text-white hover:bg-[#143326] transition-colors cursor-pointer"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => signOutAdmin()}
              className="px-4 py-2 text-xs font-medium rounded-md border border-[#E6E0D6] hover:bg-[#FAF8F4] text-[#1D221F] transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !profile) {
    return <LoginScreen onSuccess={fetchAdminProfile} authError={authError} />;
  }

  const currentItem = SIDEBAR_ITEMS.find((i) => i.id === activeModule);
  const isGoogleConnected = profile.googleConnection?.status === 'connected';

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1D221F] flex">
      <Sidebar
        activeModule={activeModule}
        onSelect={setActiveModule}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        adminEmail={profile.admin.email}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: 3 clean zones */}
        <header className="sticky top-0 z-30 bg-white border-b border-[#E6E0D6] px-4 sm:px-8 h-14 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-[#1D221F] hover:bg-[#FAF8F4] rounded-md cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs text-[#5C635E] truncate">
              <span className="font-medium text-[#1D221F]">TreeWalley SEO</span>
              <span className="mx-2">/</span>
              <span>{currentItem?.label}</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-5 text-xs text-[#5C635E] shrink-0">
            <button
              type="button"
              onClick={() => setActiveModule('blog-writer')}
              className="hover:text-[#1B4332] transition-colors whitespace-nowrap cursor-pointer"
            >
              Blog Writer
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('keywords')}
              className="hover:text-[#1B4332] transition-colors whitespace-nowrap cursor-pointer"
            >
              Keywords
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('blogger-publisher')}
              className="hover:text-[#1B4332] transition-colors whitespace-nowrap cursor-pointer"
            >
              Blogger
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('google-connections')}
              className="hover:text-[#1B4332] transition-colors whitespace-nowrap cursor-pointer"
            >
              Connections
            </button>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => signOutAdmin()}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#E6E0D6] hover:bg-[#FAF8F4] text-[#1D221F] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          {activeModule === 'overview' && (
            <OverviewView profile={profile} onNavigate={setActiveModule} />
          )}

          {activeModule === 'trends' && (
            <TrendsView
              trendsApiApproved={Boolean(profile.settings?.trendsApiApproved)}
              onDraftFromTopic={(topic, keyword, category) => {
                setWriterPrefill({ topic, keyword, category });
                setActiveModule('blog-writer');
              }}
            />
          )}

          {activeModule === 'keywords' && (
            <KeywordResearchView
              onCreateBlog={(topic, keyword) => {
                setWriterPrefill({ topic, keyword });
                setActiveModule('blog-writer');
              }}
            />
          )}

          {activeModule === 'rank-tracker' && <RankTrackerView />}

          {activeModule === 'blog-writer' && (
            <BlogWriterView
              initialPrefill={writerPrefill}
              onClearPrefill={() => setWriterPrefill(null)}
              onOpenInBlogger={(articleId) => {
                setBloggerArticleId(articleId);
                setActiveModule('blogger-publisher');
              }}
            />
          )}

          {activeModule === 'bulk-generator' && <BulkGeneratorView />}

          {activeModule === 'image-library' && <ImageLibraryView />}

          {activeModule === 'internal-links' && (
            <InternalLinksView
              defaultSitemapUrl={
                profile.settings?.sitemapUrl || 'https://www.treewalley.com/sitemap.xml'
              }
            />
          )}

          {activeModule === 'blogger-publisher' && (
            <BloggerPublisherView
              preselectedArticleId={bloggerArticleId}
              isGoogleConnected={isGoogleConnected}
              onGoToConnections={() => setActiveModule('google-connections')}
            />
          )}

          {activeModule === 'content-calendar' && (
            <ContentCalendarView
              maxDailyPublishLimit={profile.settings?.maxDailyPublishLimit ?? 5}
              onOpenArticleInBlogger={(articleId) => {
                setBloggerArticleId(articleId);
                setActiveModule('blogger-publisher');
              }}
            />
          )}

          {activeModule === 'index-monitor' && (
            <IndexMonitorView
              defaultSiteUrl={
                profile.settings?.searchConsoleSiteUrl || 'https://www.treewalley.com/'
              }
              defaultSitemapUrl={
                profile.settings?.sitemapUrl || 'https://www.treewalley.com/sitemap.xml'
              }
              isGoogleConnected={isGoogleConnected}
              onGoToConnections={() => setActiveModule('google-connections')}
            />
          )}

          {activeModule === 'seo-audit' && <SeoAuditView />}

          {activeModule === 'export-reports' && <ExportReportsView />}

          {activeModule === 'google-connections' && (
            <GoogleConnectionsView profile={profile} onRefreshProfile={fetchAdminProfile} />
          )}

          {activeModule === 'settings' && (
            <SettingsView profile={profile} onRefreshProfile={fetchAdminProfile} />
          )}
        </main>
      </div>
    </div>
  );
}
