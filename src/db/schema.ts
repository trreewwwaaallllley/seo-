import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  role: text('role').notNull().default('admin'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at').defaultNow().notNull(),
});

export const adminSettings = pgTable('admin_settings', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .unique()
    .references(() => users.uid, { onDelete: 'cascade' }),
  allowlistedEmail: text('allowlisted_email').notNull(),
  targetDomain: text('target_domain').notNull().default('https://www.treewalley.com'),
  amazonStoreUrl: text('amazon_store_url')
    .notNull()
    .default('https://www.amazon.in/stores/TreeWalley/page/1DC3D299-35DD-4738-8AB4-14CCC2956151'),
  sitemapUrl: text('sitemap_url').notNull().default('https://www.treewalley.com/sitemap.xml'),
  searchConsoleSiteUrl: text('search_console_site_url').default('https://www.treewalley.com/'),
  defaultBloggerId: text('default_blogger_id'),
  defaultBloggerName: text('default_blogger_name'),
  ga4PropertyId: text('ga4_property_id'),
  googleAdsCustomerId: text('google_ads_customer_id'),
  trendsApiApproved: boolean('trends_api_approved').notNull().default(false),
  minSeoScoreThreshold: integer('min_seo_score_threshold').notNull().default(75),
  maxDailyPublishLimit: integer('max_daily_publish_limit').notNull().default(5),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export interface GoogleServiceDiagnostic {
  service: 'login' | 'blogger' | 'searchConsole' | 'trends';
  label: string;
  status:
    | 'Connected'
    | 'Authorization Required'
    | 'API Not Enabled'
    | 'Permission Missing'
    | 'Token Expired'
    | 'Configuration Error'
    | 'Connection Failed'
    | 'Not Available';
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

export const oauthConnections = pgTable('oauth_connections', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('google'),
  oauthMode: text('oauth_mode').notNull().default('firebase_popup'),
  connectedEmail: text('connected_email'),
  scopesJson: jsonb('scopes_json').$type<string[]>().notNull().default([]),
  encryptedAccessToken: text('encrypted_access_token'),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),
  status: text('status').notNull().default('disconnected'),
  lastError: text('last_error'),
  diagnosticsJson: jsonb('diagnostics_json').$type<GoogleDiagnosticsSnapshot | null>(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const keywords = pgTable('keywords', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  keyword: text('keyword').notNull(),
  seedSource: text('seed_source'),
  country: text('country').notNull().default('India'),
  region: text('region').default('All India'),
  language: text('language').notNull().default('English'),
  listName: text('list_name').default('Core Solid Wood'),
  // Strictly separated metric bucket 1: Google Ads Keyword Planner
  adsAvgMonthlySearches: integer('ads_avg_monthly_searches'),
  adsCompetitionLevel: text('ads_competition_level'),
  adsCompetitionIndex: integer('ads_competition_index'),
  adsHistoricalJson: jsonb('ads_historical_json').$type<Array<{ month: string; searches: number }>>(),
  // Strictly separated metric bucket 2: Google Trends
  trendsInterestScore: integer('trends_interest_score'),
  trendsDirection: text('trends_direction'),
  // Strictly separated metric bucket 3: Google Search Console
  gscClicks: integer('gsc_clicks'),
  gscImpressions: integer('gsc_impressions'),
  gscCtr: real('gsc_ctr'),
  gscAvgPosition: real('gsc_avg_position'),
  gscLandingPage: text('gsc_landing_page'),
  // Intent & Opportunity Analysis
  commercialIntent: text('commercial_intent'),
  informationalIntent: text('informational_intent'),
  relatedKeywordsJson: jsonb('related_keywords_json').$type<string[]>().default([]),
  longTailKeywordsJson: jsonb('long_tail_keywords_json').$type<string[]>().default([]),
  suggestedTopic: text('suggested_topic'),
  opportunityScore: integer('opportunity_score'),
  dataSourceLabel: text('data_source_label').notNull().default('Unconnected'),
  saved: boolean('saved').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const trendSnapshots = pgTable('trend_snapshots', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  keyword: text('keyword').notNull(),
  country: text('country').notNull().default('India'),
  region: text('region').default('All Regions'),
  timeframe: text('timeframe').notNull().default('12m'),
  interestSeriesJson: jsonb('interest_series_json')
    .$type<Array<{ date: string; value: number }>>()
    .notNull()
    .default([]),
  regionInterestJson: jsonb('region_interest_json')
    .$type<Array<{ region: string; value: number }>>()
    .notNull()
    .default([]),
  risingQueriesJson: jsonb('rising_queries_json')
    .$type<Array<{ query: string; growth: string }>>()
    .notNull()
    .default([]),
  relatedTopicsJson: jsonb('related_topics_json').$type<string[]>().notNull().default([]),
  discoveredTopicsJson: jsonb('discovered_topics_json').$type<string[]>().notNull().default([]),
  seasonalNote: text('seasonal_note'),
  sourceType: text('source_type').notNull().default('manual_csv_import'),
  importedAt: timestamp('imported_at').defaultNow().notNull(),
});

export const gscSnapshots = pgTable('gsc_snapshots', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  siteUrl: text('site_url').notNull(),
  dateRangeStart: text('date_range_start').notNull(),
  dateRangeEnd: text('date_range_end').notNull(),
  totalClicks: integer('total_clicks').notNull().default(0),
  totalImpressions: integer('total_impressions').notNull().default(0),
  avgCtr: real('avg_ctr').notNull().default(0),
  avgPosition: real('avg_position').notNull().default(0),
  dailyTrendJson: jsonb('daily_trend_json')
    .$type<Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>>()
    .notNull()
    .default([]),
  topPagesJson: jsonb('top_pages_json')
    .$type<Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>>()
    .notNull()
    .default([]),
  topQueriesJson: jsonb('top_queries_json')
    .$type<Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number; deltaPosition?: number }>>()
    .notNull()
    .default([]),
  devicesJson: jsonb('devices_json')
    .$type<Array<{ device: string; clicks: number; impressions: number; ctr: number; position: number }>>()
    .notNull()
    .default([]),
  countriesJson: jsonb('countries_json')
    .$type<Array<{ country: string; clicks: number; impressions: number; ctr: number; position: number }>>()
    .notNull()
    .default([]),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),
});

export const rankHistory = pgTable('rank_history', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  keyword: text('keyword').notNull(),
  landingPage: text('landing_page').notNull(),
  date: text('date').notNull(),
  avgPosition: real('avg_position').notNull(),
  previousPosition: real('previous_position'),
  clicks: integer('clicks').notNull().default(0),
  impressions: integer('impressions').notNull().default(0),
  ctr: real('ctr').notNull().default(0),
  country: text('country').notNull().default('IND'),
  device: text('device').notNull().default('ALL'),
  bucket: text('bucket').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const indexInspections = pgTable('index_inspections', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  verdict: text('verdict').notNull(),
  coverageState: text('coverage_state').notNull(),
  indexingState: text('indexing_state'),
  lastCrawlTime: text('last_crawl_time'),
  crawledAs: text('crawled_as'),
  googleCanonical: text('google_canonical'),
  userCanonical: text('user_canonical'),
  robotsTxtState: text('robots_txt_state'),
  pageFetchState: text('page_fetch_state'),
  rawResultJson: jsonb('raw_result_json'),
  inspectedAt: timestamp('inspected_at').defaultNow().notNull(),
});

export const internalLinks = pgTable('internal_links', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  title: text('title').notNull(),
  pageType: text('page_type').notNull().default('product'),
  category: text('category').notNull().default('General'),
  keywordsJson: jsonb('keywords_json').$type<string[]>().notNull().default([]),
  httpStatus: integer('http_status'),
  lastCheckedAt: timestamp('last_checked_at'),
  source: text('source').notNull().default('sitemap'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const externalReferences = pgTable('external_references', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  title: text('title').notNull(),
  publisher: text('publisher').notNull(),
  category: text('category').notNull().default('Standards'),
  approved: boolean('approved').notNull().default(true),
  httpStatus: integer('http_status'),
  lastCheckedAt: timestamp('last_checked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const mediaAssets = pgTable('media_assets', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  seoFilename: text('seo_filename').notNull(),
  originalName: text('original_name').notNull(),
  category: text('category').notNull().default('Wooden beds'),
  mimeType: text('mime_type').notNull(),
  width: integer('width').notNull().default(1200),
  height: integer('height').notNull().default(800),
  sizeBytes: integer('size_bytes').notNull().default(0),
  publicUrl: text('public_url').notNull(),
  webpUrl: text('webp_url'),
  altText: text('alt_text').notNull(),
  caption: text('caption'),
  isTreeWalleyProduct: boolean('is_treewalley_product').notNull().default(true),
  productUrl: text('product_url'),
  publicVerified: boolean('public_verified').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const articles = pgTable('articles', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  bulkJobId: integer('bulk_job_id'),
  title: text('title').notNull(),
  seoTitle: text('seo_title').notNull(),
  slug: text('slug').notNull(),
  metaDescription: text('meta_description').notNull(),
  primaryKeyword: text('primary_keyword').notNull(),
  secondaryKeywordsJson: jsonb('secondary_keywords_json').$type<string[]>().notNull().default([]),
  languageCode: text('language_code').notNull().default('en'),
  languageName: text('language_name').notNull().default('English'),
  regionalVariation: text('regional_variation').default('India (en-IN)'),
  targetCountry: text('target_country').notNull().default('India'),
  mode: text('mode').notNull().default('SEO Buying Guide'),
  writingStyle: text('writing_style').notNull().default('Premium editorial'),
  blogCategory: text('blog_category').notNull().default('Wooden beds'),
  targetAudience: text('target_audience').default('Indian homeowners seeking heirloom solid wood furniture'),
  wordCountTarget: integer('word_count_target').notNull().default(1200),
  wordCountActual: integer('word_count_actual').notNull().default(0),
  contentHtml: text('content_html').notNull(),
  faqJson: jsonb('faq_json').$type<Array<{ question: string; answer: string }>>().notNull().default([]),
  internalLinksJson: jsonb('internal_links_json')
    .$type<Array<{ url: string; anchor: string; valid?: boolean }>>()
    .notNull()
    .default([]),
  externalLinksJson: jsonb('external_links_json')
    .$type<Array<{ url: string; title: string; valid?: boolean }>>()
    .notNull()
    .default([]),
  featuredImageUrl: text('featured_image_url'),
  imagesJson: jsonb('images_json')
    .$type<Array<{ url: string; alt: string; caption?: string; width?: number; height?: number }>>()
    .notNull()
    .default([]),
  labelsJson: jsonb('labels_json').$type<string[]>().notNull().default([]),
  seoScore: integer('seo_score').notNull().default(0),
  seoAuditJson: jsonb('seo_audit_json')
    .$type<{
      score: number;
      checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
    }>(),
  cannibalizationWarning: text('cannibalization_warning'),
  duplicateScore: integer('duplicate_score').notNull().default(0),
  languageReliabilityFlag: text('language_reliability_flag').notNull().default('High'),
  status: text('status').notNull().default('draft'),
  scheduledFor: timestamp('scheduled_for'),
  bloggerBlogId: text('blogger_blog_id'),
  bloggerPostId: text('blogger_post_id'),
  bloggerPostUrl: text('blogger_post_url'),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const bulkJobs = pgTable('bulk_jobs', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  batchName: text('batch_name').notNull(),
  requestedCount: integer('requested_count').notNull(),
  completedCount: integer('completed_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  status: text('status').notNull().default('queued'),
  topicsJson: jsonb('topics_json')
    .$type<Array<{ topic: string; primaryKeyword: string; category: string; status: string; error?: string; articleId?: number }>>()
    .notNull()
    .default([]),
  languageCode: text('language_code').notNull().default('en'),
  languageName: text('language_name').notNull().default('English'),
  mode: text('mode').notNull().default('SEO Buying Guide'),
  writingStyle: text('writing_style').notNull().default('Premium editorial'),
  concurrency: integer('concurrency').notNull().default(3),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  throughputPerMin: real('throughput_per_min').notNull().default(0),
  errorSummary: text('error_summary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const publishingLogs = pgTable('publishing_logs', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  articleId: integer('article_id').references(() => articles.id, { onDelete: 'set null' }),
  articleTitle: text('article_title').notNull(),
  bloggerBlogId: text('blogger_blog_id').notNull(),
  bloggerBlogName: text('blogger_blog_name'),
  action: text('action').notNull(),
  status: text('status').notNull(),
  postId: text('post_id'),
  publicUrl: text('public_url'),
  errorDetails: text('error_details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditReports = pgTable('audit_reports', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  reportMonth: text('report_month').notNull(),
  comparisonWindow: text('comparison_window').notNull().default('previous_month'),
  executiveSummary: text('executive_summary').notNull(),
  sectionsJson: jsonb('sections_json')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .notNull()
    .references(() => users.uid, { onDelete: 'cascade' }),
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(),
  module: text('module').notNull(),
  details: text('details').notNull(),
  status: text('status').notNull().default('success'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  settings: one(adminSettings, {
    fields: [users.uid],
    references: [adminSettings.userUid],
  }),
  articles: many(articles),
  keywords: many(keywords),
  mediaAssets: many(mediaAssets),
  publishingLogs: many(publishingLogs),
}));
