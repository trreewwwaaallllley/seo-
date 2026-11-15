export type SidebarModuleId =
  | 'overview'
  | 'trends'
  | 'keywords'
  | 'rank-tracker'
  | 'blog-writer'
  | 'bulk-generator'
  | 'image-library'
  | 'internal-links'
  | 'blogger-publisher'
  | 'content-calendar'
  | 'index-monitor'
  | 'seo-audit'
  | 'export-reports'
  | 'google-connections'
  | 'settings';

export interface AdminSettings {
  id: number;
  allowlistedEmail: string;
  targetDomain: string;
  amazonStoreUrl: string;
  sitemapUrl: string;
  searchConsoleSiteUrl: string | null;
  defaultBloggerId: string | null;
  defaultBloggerName: string | null;
  ga4PropertyId: string | null;
  googleAdsCustomerId: string | null;
  trendsApiApproved: boolean;
  minSeoScoreThreshold: number;
  maxDailyPublishLimit: number;
}

export type DiagnosticStatus =
  | 'Connected'
  | 'Authorization Required'
  | 'API Not Enabled'
  | 'Permission Missing'
  | 'Token Expired'
  | 'Configuration Error'
  | 'Connection Failed'
  | 'Not Available';

export interface GoogleServiceDiagnostic {
  service: 'login' | 'blogger' | 'searchConsole' | 'trends';
  label: string;
  status: DiagnosticStatus;
  connectedEmail: string | null;
  requiredScopes: string[];
  grantedScopes: string[];
  permissionOk: boolean;
  lastTestedAt: string | null;
  lastHttpStatus: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  details: string | null;
}

export interface GoogleDiagnosticsSnapshot {
  login: GoogleServiceDiagnostic;
  blogger: GoogleServiceDiagnostic;
  searchConsole: GoogleServiceDiagnostic;
  trends: GoogleServiceDiagnostic;
}

export interface CloudConfigCheckItem {
  id: string;
  label: string;
  status: 'ok' | 'missing' | 'warning' | 'untested';
  value: string;
  detail: string;
}

export interface DiagnosticsOverviewResponse {
  oauthMode: 'oauth_code_offline' | 'firebase_popup' | 'none';
  hasRefreshToken: boolean;
  tokenExpiresAt: string | null;
  connectedEmail: string | null;
  grantedScopes: string[];
  diagnostics: GoogleDiagnosticsSnapshot;
  configChecks: CloudConfigCheckItem[];
  oauthEnvConfigured: boolean;
  expectedRedirectUris: string[];
  expectedOrigins: string[];
  missingSecrets: string[];
}

export interface BloggerPostItem {
  id: string;
  title: string;
  url?: string;
  status?: 'LIVE' | 'DRAFT' | 'SCHEDULED' | string;
  published?: string;
  updated?: string;
  labels?: string[];
  images?: Array<{ url: string }>;
  author?: { displayName?: string };
}

export interface AdminProfileResponse {
  admin: {
    uid: string;
    email: string;
    name: string;
    picture: string | null;
  };
  settings: AdminSettings;
  googleConnection: {
    status: string;
    oauthMode?: string;
    hasRefreshToken?: boolean;
    connectedEmail?: string | null;
    scopesJson: string[];
    tokenExpiresAt?: string | null;
    lastError?: string | null;
    diagnosticsJson?: GoogleDiagnosticsSnapshot | null;
    updatedAt?: string;
  };
  recentActivity: Array<{
    id: number;
    actorEmail: string;
    action: string;
    module: string;
    details: string;
    status: string;
    createdAt: string;
  }>;
  capabilities: {
    geminiConfigured: boolean;
    googleAdsDeveloperTokenConfigured: boolean;
    googleOAuthClientConfigured?: boolean;
    activeOAuthClientId?: string;
    firebaseProjectId?: string;
    appUrl: string;
  };
}

export interface GscSnapshot {
  id: number;
  siteUrl: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  dailyTrendJson: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>;
  topPagesJson: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>;
  topQueriesJson: Array<{ query: string; page?: string; clicks: number; impressions: number; ctr: number; position: number }>;
  devicesJson: Array<{ device: string; clicks: number; impressions: number; ctr: number; position: number }>;
  countriesJson: Array<{ country: string; clicks: number; impressions: number; ctr: number; position: number }>;
  syncedAt: string;
}

export interface KeywordRow {
  id: number;
  keyword: string;
  seedSource: string | null;
  country: string;
  region: string | null;
  language: string;
  listName: string | null;
  adsAvgMonthlySearches: number | null;
  adsCompetitionLevel: string | null;
  adsCompetitionIndex: number | null;
  adsHistoricalJson: Array<{ month: string; searches: number }> | null;
  trendsInterestScore: number | null;
  trendsDirection: string | null;
  gscClicks: number | null;
  gscImpressions: number | null;
  gscCtr: number | null;
  gscAvgPosition: number | null;
  gscLandingPage: string | null;
  commercialIntent: string | null;
  informationalIntent: string | null;
  relatedKeywordsJson: string[];
  longTailKeywordsJson: string[];
  suggestedTopic: string | null;
  opportunityScore: number | null;
  dataSourceLabel: string;
  saved: boolean;
  updatedAt: string;
}

export interface TrendSnapshot {
  id: number;
  category: string;
  keyword: string;
  country: string;
  region: string | null;
  timeframe: string;
  interestSeriesJson: Array<{ date: string; value: number }>;
  regionInterestJson: Array<{ region: string; value: number }>;
  risingQueriesJson: Array<{ query: string; growth: string }>;
  relatedTopicsJson: string[];
  discoveredTopicsJson: string[];
  seasonalNote: string | null;
  sourceType: string;
  importedAt: string;
}

export interface RankRow {
  id: number;
  keyword: string;
  landingPage: string;
  date: string;
  avgPosition: number;
  previousPosition: number | null;
  clicks: number;
  impressions: number;
  ctr: number;
  country: string;
  device: string;
  bucket: string;
}

export interface Article {
  id: number;
  bulkJobId: number | null;
  title: string;
  seoTitle: string;
  slug: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywordsJson: string[];
  languageCode: string;
  languageName: string;
  regionalVariation: string | null;
  targetCountry: string;
  mode: string;
  writingStyle: string;
  blogCategory: string;
  targetAudience: string | null;
  wordCountTarget: number;
  wordCountActual: number;
  contentHtml: string;
  faqJson: Array<{ question: string; answer: string }>;
  internalLinksJson: Array<{ url: string; anchor: string; valid?: boolean }>;
  externalLinksJson: Array<{ url: string; title: string; valid?: boolean }>;
  featuredImageUrl: string | null;
  imagesJson: Array<{ url: string; alt: string; caption?: string; width?: number; height?: number }>;
  labelsJson: string[];
  seoScore: number;
  seoAuditJson: {
    score: number;
    checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  } | null;
  cannibalizationWarning: string | null;
  duplicateScore: number;
  languageReliabilityFlag: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'published' | 'failed';
  scheduledFor: string | null;
  bloggerBlogId: string | null;
  bloggerPostId: string | null;
  bloggerPostUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BulkJob {
  id: number;
  batchName: string;
  requestedCount: number;
  completedCount: number;
  failedCount: number;
  status: string;
  topicsJson: Array<{
    topic: string;
    primaryKeyword: string;
    category: string;
    status: string;
    error?: string;
    articleId?: number;
  }>;
  languageCode: string;
  languageName: string;
  mode: string;
  writingStyle: string;
  concurrency: number;
  startedAt: string | null;
  finishedAt: string | null;
  throughputPerMin: number;
  errorSummary: string | null;
  createdAt: string;
}

export interface MediaAsset {
  id: number;
  filename: string;
  seoFilename: string;
  originalName: string;
  category: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  publicUrl: string;
  webpUrl: string | null;
  altText: string;
  caption: string | null;
  isTreeWalleyProduct: boolean;
  productUrl: string | null;
  publicVerified: boolean;
  createdAt: string;
}

export interface InternalLinkRow {
  id: number;
  url: string;
  title: string;
  pageType: string;
  category: string;
  keywordsJson: string[];
  httpStatus: number | null;
  lastCheckedAt: string | null;
  source: string;
}

export interface ExternalRefRow {
  id: number;
  url: string;
  title: string;
  publisher: string;
  category: string;
  approved: boolean;
  httpStatus: number | null;
  lastCheckedAt: string | null;
}

export interface BloggerBlog {
  id: string;
  name: string;
  url: string;
  posts?: { totalItems: number };
}

export interface PublishingLogRow {
  id: number;
  articleId: number | null;
  articleTitle: string;
  bloggerBlogId: string;
  bloggerBlogName: string | null;
  action: string;
  status: string;
  postId: string | null;
  publicUrl: string | null;
  errorDetails: string | null;
  createdAt: string;
}

export interface IndexInspectionRow {
  id: number;
  url: string;
  verdict: string;
  coverageState: string;
  indexingState: string | null;
  lastCrawlTime: string | null;
  crawledAs: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  inspectedAt: string;
}

export interface AuditReportRow {
  id: number;
  reportMonth: string;
  comparisonWindow: string;
  executiveSummary: string;
  sectionsJson: Record<string, any>;
  generatedAt: string;
}
