import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import { createServer as createViteServer } from 'vite';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from './src/db/index.ts';
import {
  activityLogs,
  adminSettings,
  articles,
  auditReports,
  bulkJobs,
  externalReferences,
  gscSnapshots,
  indexInspections,
  internalLinks,
  keywords,
  mediaAssets,
  oauthConnections,
  publishingLogs,
  rankHistory,
  trendSnapshots,
} from './src/db/schema.ts';
import crypto from 'crypto';
import { AuthRequest, requireAdminAuth } from './src/middleware/auth.ts';
import { decryptToken, encryptToken, signOAuthState, verifyOAuthState } from './src/server/crypto.ts';
import {
  analyzeKeywordExpansion,
  generateAuditSummaryAndPlan,
  generateImageMetadata,
  generateInspirationImage,
  generateSeoArticle,
  generateTrendTopics,
} from './src/server/gemini.ts';
import {
  createOrUpdateBloggerPost,
  exchangeGoogleAuthCode,
  fetchGoogleAdsKeywordIdeas,
  fetchGoogleUserInfo,
  getBloggerPost,
  GoogleApiError,
  inspectGscUrl,
  listBloggerBlogs,
  listBloggerPosts,
  listGscSitemaps,
  listGscSites,
  queryGscSearchAnalytics,
  submitGscSitemap,
} from './src/server/googleApis.ts';
import {
  BLOGGER_SCOPE,
  buildCloudConfigChecklist,
  defaultDiagnosticsSnapshot,
  getExpectedRedirectUri,
  GSC_FULL_SCOPE,
  GSC_READONLY_SCOPE,
  isGoogleOAuthClientConfigured,
  OAUTH_LOGIN_SCOPES,
  resolveGoogleAccessToken,
  runGoogleDiagnostics,
} from './src/server/googleDiagnostics.ts';
import {
  mapGoogleApiError,
  sanitizeGoogleDetail,
  verifyGoogleTokenInfo,
} from './src/server/googleErrorMapper.ts';
import { validateArticleSeo } from './src/server/seoValidator.ts';
import { crawlXmlSitemap, verifyHttpUrl } from './src/server/sitemapCrawler.ts';
import { startBulkJobRunner } from './src/server/bulkWorker.ts';
import { LANGUAGES_350 } from './src/data/languages.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const ASSETS_IMG_DIR = path.resolve(process.cwd(), 'src/assets/images');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

function getPublicBaseUrl(req: express.Request): string {
  const configured = process.env.APP_URL;
  if (configured && configured !== 'MY_APP_URL' && configured.startsWith('http')) {
    return configured.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function makeAbsoluteHttpsUrls(html: string, baseUrl: string): string {
  return html
    .replace(/src="\/media\//g, `src="${baseUrl}/media/`)
    .replace(/src="\/assets\/images\//g, `src="${baseUrl}/assets/images/`)
    .replace(/src='\/media\//g, `src='${baseUrl}/media/`)
    .replace(/src='\/assets\/images\//g, `src='${baseUrl}/assets/images/`);
}

function bucketForPosition(pos: number): string {
  if (pos <= 3) return '1-3';
  if (pos <= 10) return '4-10';
  if (pos <= 20) return '11-20';
  if (pos <= 50) return '21-50';
  if (pos <= 100) return '51-100';
  return '100+';
}

async function logActivity(
  userUid: string,
  actorEmail: string,
  action: string,
  module: string,
  details: string,
  status: 'success' | 'error' = 'success'
) {
  try {
    await db.insert(activityLogs).values({
      userUid,
      actorEmail,
      action,
      module,
      details,
      status,
    });
  } catch (err) {
    console.error('Activity log write failed:', err);
  }
}

async function getGoogleAccessToken(req: AuthRequest): Promise<string | null> {
  const headerToken = typeof req.headers['x-google-access-token'] === 'string'
    ? req.headers['x-google-access-token']
    : null;
  const result = await resolveGoogleAccessToken(req.user!.uid, headerToken);
  return result.accessToken;
}

async function requireGoogleToken(
  req: AuthRequest,
  res: express.Response
): Promise<string | null> {
  const headerToken = typeof req.headers['x-google-access-token'] === 'string'
    ? req.headers['x-google-access-token']
    : null;
  const result = await resolveGoogleAccessToken(req.user!.uid, headerToken);
  if (!result.accessToken) {
    res.status(result.error?.httpStatus || 401).json({
      error: result.error?.userMessage || 'Google API authorization required.',
      errorCode: result.error?.errorCode || 'not_connected',
      status: result.error?.status || 'Authorization Required',
    });
    return null;
  }
  return result.accessToken;
}

function sendGoogleError(res: express.Response, error: any, fallbackMessage: string) {
  if (error instanceof GoogleApiError) {
    return res.status(error.httpStatus >= 400 && error.httpStatus < 600 ? error.httpStatus : 502).json({
      error: error.message,
      errorCode: error.mapped.errorCode,
      status: error.mapped.status,
      httpStatus: error.httpStatus,
    });
  }
  return res.status(502).json({ error: sanitizeGoogleDetail(error?.message || fallbackMessage) });
}

function renderOAuthPopupHtml(payload: { type: 'GOOGLE_API_OAUTH_SUCCESS' | 'GOOGLE_API_OAUTH_ERROR'; errorCode?: string; message?: string }) {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>TreeWalley Google API Authorization</title></head>
<body style="font-family:system-ui,sans-serif;background:#FAF8F4;color:#1D221F;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;">
  <div style="max-width:420px;background:#fff;border:1px solid #E6E0D6;border-radius:8px;padding:24px;">
    <h2 style="margin:0 0 8px;color:#1B4332;">${payload.type === 'GOOGLE_API_OAUTH_SUCCESS' ? 'Google API Access Authorized' : 'Google API Authorization Failed'}</h2>
    <p style="font-size:13px;color:#5C635E;margin:0 0 16px;">${payload.message ? String(payload.message).replace(/</g, '&lt;') : 'You may close this window and return to TreeWalley SEO Command Center.'}</p>
    <button onclick="window.close()" style="background:#1B4332;color:#FAF8F4;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;">Close Window</button>
  </div>
  <script>
    (function() {
      var data = ${safeJson};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(data, '*');
        }
      } catch (e) {}
      setTimeout(function() { try { window.close(); } catch (e) {} }, 900);
    })();
  </script>
</body>
</html>`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Public media endpoints so published Blogger articles & public previews render images over HTTPS
  app.use(
    '/media',
    express.static(UPLOADS_DIR, {
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
      },
    })
  );
  if (fs.existsSync(ASSETS_IMG_DIR)) {
    app.use(
      '/assets/images',
      express.static(ASSETS_IMG_DIR, {
        maxAge: '7d',
        setHeaders: (res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
        },
      })
    );
  }

  // Public health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'treewalley-seo-command-center', timestamp: new Date().toISOString() });
  });

  // Public read-only published article verification URL (only for explicitly published articles)
  app.get('/public/article/:slug', async (req, res) => {
    try {
      const [article] = await db
        .select()
        .from(articles)
        .where(and(eq(articles.slug, req.params.slug), eq(articles.status, 'published')))
        .limit(1);
      if (!article) {
        return res.status(404).send('<h1>Article not published or unavailable</h1>');
      }
      const baseUrl = getPublicBaseUrl(req);
      const htmlBody = makeAbsoluteHttpsUrls(article.contentHtml, baseUrl);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!doctype html>
<html lang="${article.languageCode}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${article.seoTitle}</title>
  <meta name="description" content="${article.metaDescription}" />
  <style>
    body { font-family: Georgia, serif; max-width: 780px; margin: 48px auto; padding: 0 20px; color: #1d221f; line-height: 1.7; background: #faf8f4; }
    h1 { font-size: 2.2rem; line-height: 1.2; color: #1b4332; }
    h2 { margin-top: 2rem; color: #1b4332; }
    img { max-width: 100%; height: auto; border-radius: 6px; }
    figure { margin: 24px 0; }
    figcaption { font-size: 0.875rem; color: #5c635e; margin-top: 8px; }
  </style>
</head>
<body>
  <article>
    <h1>${article.title}</h1>
    ${htmlBody}
  </article>
</body>
</html>`);
    } catch (err) {
      res.status(500).send('Unable to render published article.');
    }
  });

  // =========================================================================
  // ALL /api/* ROUTES BELOW REQUIRE SINGLE-ADMIN FIREBASE AUTH + ALLOWLIST
  // =========================================================================

  // 1. Admin Profile, Settings, Activity Logs, Backup
  app.get('/api/admin/me', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const [settings] = await db
        .select()
        .from(adminSettings)
        .where(eq(adminSettings.userUid, uid))
        .limit(1);
      const [conn] = await db
        .select({
          id: oauthConnections.id,
          provider: oauthConnections.provider,
          oauthMode: oauthConnections.oauthMode,
          connectedEmail: oauthConnections.connectedEmail,
          scopesJson: oauthConnections.scopesJson,
          encryptedRefreshToken: oauthConnections.encryptedRefreshToken,
          tokenExpiresAt: oauthConnections.tokenExpiresAt,
          status: oauthConnections.status,
          lastError: oauthConnections.lastError,
          diagnosticsJson: oauthConnections.diagnosticsJson,
          updatedAt: oauthConnections.updatedAt,
        })
        .from(oauthConnections)
        .where(and(eq(oauthConnections.userUid, uid), eq(oauthConnections.provider, 'google')))
        .limit(1);

      const recentActivity = await db
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.userUid, uid))
        .orderBy(desc(activityLogs.createdAt))
        .limit(50);

      const isExpiredWithoutRefresh =
        conn?.status === 'connected' &&
        !conn.encryptedRefreshToken &&
        Boolean(conn.tokenExpiresAt) &&
        new Date(conn.tokenExpiresAt!).getTime() <= Date.now();

      res.json({
        admin: {
          uid,
          email: req.adminEmail,
          name: req.user?.name || 'TreeWalley Administrator',
          picture: req.user?.picture || null,
        },
        settings,
        googleConnection: conn
          ? {
              id: conn.id,
              provider: conn.provider,
              oauthMode: conn.oauthMode,
              hasRefreshToken: Boolean(conn.encryptedRefreshToken),
              connectedEmail: conn.connectedEmail,
              scopesJson: conn.scopesJson,
              tokenExpiresAt: conn.tokenExpiresAt,
              status: isExpiredWithoutRefresh ? 'expired' : conn.status,
              lastError: conn.lastError,
              diagnosticsJson: conn.diagnosticsJson,
              updatedAt: conn.updatedAt,
            }
          : { status: 'disconnected', scopesJson: [], hasRefreshToken: false },
        recentActivity,
        capabilities: {
          geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
          googleAdsDeveloperTokenConfigured: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
          googleOAuthClientConfigured: isGoogleOAuthClientConfigured(),
          appUrl: getPublicBaseUrl(req),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load admin profile.' });
    }
  });

  app.put('/api/admin/settings', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const body = req.body || {};
      const [updated] = await db
        .update(adminSettings)
        .set({
          targetDomain: body.targetDomain,
          amazonStoreUrl: body.amazonStoreUrl,
          sitemapUrl: body.sitemapUrl,
          searchConsoleSiteUrl: body.searchConsoleSiteUrl,
          defaultBloggerId: body.defaultBloggerId,
          defaultBloggerName: body.defaultBloggerName,
          ga4PropertyId: body.ga4PropertyId,
          googleAdsCustomerId: body.googleAdsCustomerId,
          trendsApiApproved: Boolean(body.trendsApiApproved),
          minSeoScoreThreshold: Number(body.minSeoScoreThreshold) || 75,
          maxDailyPublishLimit: Number(body.maxDailyPublishLimit) || 5,
          updatedAt: new Date(),
        })
        .where(eq(adminSettings.userUid, uid))
        .returning();

      await logActivity(uid, req.adminEmail!, 'Updated Admin Settings', 'Settings', `Domain: ${updated.targetDomain}`);
      res.json({ settings: updated });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to save settings.' });
    }
  });

  app.get('/api/admin/backup', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const [settings, kw, art, links, refs, media, logs, audits] = await Promise.all([
        db.select().from(adminSettings).where(eq(adminSettings.userUid, uid)),
        db.select().from(keywords).where(eq(keywords.userUid, uid)),
        db.select().from(articles).where(eq(articles.userUid, uid)),
        db.select().from(internalLinks).where(eq(internalLinks.userUid, uid)),
        db.select().from(externalReferences).where(eq(externalReferences.userUid, uid)),
        db.select().from(mediaAssets).where(eq(mediaAssets.userUid, uid)),
        db.select().from(publishingLogs).where(eq(publishingLogs.userUid, uid)),
        db.select().from(auditReports).where(eq(auditReports.userUid, uid)),
      ]);
      await logActivity(uid, req.adminEmail!, 'Exported Full Backup', 'Settings', `${art.length} articles, ${kw.length} keywords`);
      res.json({
        exportedAt: new Date().toISOString(),
        settings,
        keywords: kw,
        articles: art,
        internalLinks: links,
        externalReferences: refs,
        mediaAssets: media,
        publishingLogs: logs,
        auditReports: audits,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Backup export failed.' });
    }
  });

  // 2. Separate Google API OAuth 2.0 Authorization Code Flow + Encrypted Token Storage + Diagnostics
  app.get('/api/oauth/google/url', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const publicBaseUrl = getPublicBaseUrl(req);
      const redirectUri = getExpectedRedirectUri(publicBaseUrl);
      const servicesParam = String(req.query.services || 'blogger,searchConsole');
      const requestedServiceKeys = servicesParam.split(',').map((s) => s.trim()).filter(Boolean);

      const scopeSet = new Set<string>(OAUTH_LOGIN_SCOPES);
      if (requestedServiceKeys.includes('blogger')) scopeSet.add(BLOGGER_SCOPE);
      if (requestedServiceKeys.includes('searchConsole')) {
        scopeSet.add(GSC_READONLY_SCOPE);
        scopeSet.add(GSC_FULL_SCOPE);
      }
      if (requestedServiceKeys.includes('analytics')) {
        scopeSet.add('https://www.googleapis.com/auth/analytics.readonly');
      }
      if (requestedServiceKeys.includes('ads')) {
        scopeSet.add('https://www.googleapis.com/auth/adwords');
      }
      const requestedScopes = Array.from(scopeSet);

      if (!isGoogleOAuthClientConfigured()) {
        return res.json({
          configured: false,
          mode: 'firebase_popup',
          redirectUri,
          requestedScopes,
          missingSecrets: [
            ...(!process.env.GOOGLE_CLIENT_ID?.trim() ? ['GOOGLE_CLIENT_ID'] : []),
            ...(!process.env.GOOGLE_CLIENT_SECRET?.trim() ? ['GOOGLE_CLIENT_SECRET'] : []),
          ],
        });
      }

      const state = signOAuthState({
        uid: req.user!.uid,
        email: req.adminEmail!,
        services: requestedServiceKeys,
        nonce: crypto.randomBytes(12).toString('hex'),
        ts: Date.now(),
      });

      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: requestedScopes.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        login_hint: req.adminEmail!,
        state,
      });

      res.json({
        configured: true,
        mode: 'oauth_code_offline',
        authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        redirectUri,
        requestedScopes,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to build Google OAuth authorization URL.' });
    }
  });

  app.get(['/api/oauth/google/callback', '/api/oauth/google/callback/'], async (req, res) => {
    const rawError = typeof req.query.error === 'string' ? req.query.error : '';
    const rawCode = typeof req.query.code === 'string' ? req.query.code : '';
    const rawState = typeof req.query.state === 'string' ? req.query.state : '';

    const statePayload = verifyOAuthState(rawState);
    if (!statePayload) {
      return res
        .status(400)
        .send(
          renderOAuthPopupHtml({
            type: 'GOOGLE_API_OAUTH_ERROR',
            errorCode: rawError || 'invalid_state',
            message: 'Invalid or expired OAuth state parameter. Return to the app and try authorizing again.',
          })
        );
    }

    if (rawError) {
      const mapped = mapGoogleApiError(400, { error: rawError, error_description: req.query.error_description }, { service: 'oauth', oauthError: rawError });
      await db
        .update(oauthConnections)
        .set({ status: 'error', lastError: mapped.userMessage, updatedAt: new Date() })
        .where(and(eq(oauthConnections.userUid, statePayload.uid), eq(oauthConnections.provider, 'google')))
        .catch(() => null);
      await logActivity(statePayload.uid, statePayload.email, 'Google OAuth Failed', 'Google Connections', `${mapped.errorCode}: ${mapped.userMessage}`, 'error');

      return res.status(400).send(
        renderOAuthPopupHtml({
          type: 'GOOGLE_API_OAUTH_ERROR',
          errorCode: mapped.errorCode,
          message: mapped.userMessage,
        })
      );
    }

    if (!rawCode) {
      return res.status(400).send(
        renderOAuthPopupHtml({
          type: 'GOOGLE_API_OAUTH_ERROR',
          errorCode: 'missing_code',
          message: 'Authorization code missing from Google callback.',
        })
      );
    }

    if (!isGoogleOAuthClientConfigured()) {
      return res.status(500).send(
        renderOAuthPopupHtml({
          type: 'GOOGLE_API_OAUTH_ERROR',
          errorCode: 'invalid_client',
          message: 'Backend GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing.',
        })
      );
    }

    try {
      const publicBaseUrl = getPublicBaseUrl(req);
      const redirectUri = getExpectedRedirectUri(publicBaseUrl);
      const tokenResp = await exchangeGoogleAuthCode({
        code: rawCode,
        clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirectUri,
      });

      const userInfo = await fetchGoogleUserInfo(tokenResp.access_token).catch(() => ({ email: statePayload.email }));
      const connectedEmail = (userInfo.email || statePayload.email).toLowerCase();
      const allowlisted = (process.env.ADMIN_ALLOWLIST_EMAIL || 'mrramsain03@gmail.com').trim().toLowerCase();

      if (connectedEmail !== allowlisted) {
        return res.status(403).send(
          renderOAuthPopupHtml({
            type: 'GOOGLE_API_OAUTH_ERROR',
            errorCode: 'access_denied',
            message: `Google account ${connectedEmail} does not match authorized administrator ${allowlisted}.`,
          })
        );
      }

      const grantedScopes = tokenResp.scope
        ? tokenResp.scope.split(/\s+/).map((s) => s.trim()).filter(Boolean)
        : [];
      const expiresAt = new Date(Date.now() + (Number(tokenResp.expires_in) || 3500) * 1000);
      const encryptedAccess = encryptToken(tokenResp.access_token);
      const encryptedRefresh = tokenResp.refresh_token ? encryptToken(tokenResp.refresh_token) : undefined;

      const existing = await db
        .select()
        .from(oauthConnections)
        .where(and(eq(oauthConnections.userUid, statePayload.uid), eq(oauthConnections.provider, 'google')))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(oauthConnections)
          .set({
            oauthMode: 'oauth_code_offline',
            connectedEmail,
            scopesJson: grantedScopes,
            encryptedAccessToken: encryptedAccess,
            ...(encryptedRefresh ? { encryptedRefreshToken: encryptedRefresh } : {}),
            tokenExpiresAt: expiresAt,
            status: 'connected',
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(oauthConnections.id, existing[0].id));
      } else {
        await db.insert(oauthConnections).values({
          userUid: statePayload.uid,
          provider: 'google',
          oauthMode: 'oauth_code_offline',
          connectedEmail,
          scopesJson: grantedScopes,
          encryptedAccessToken: encryptedAccess,
          encryptedRefreshToken: encryptedRefresh || null,
          tokenExpiresAt: expiresAt,
          status: 'connected',
        });
      }

      await runGoogleDiagnostics({
        uid: statePayload.uid,
        adminEmail: statePayload.email,
        target: 'all',
      });

      await logActivity(
        statePayload.uid,
        statePayload.email,
        'Authorized Google APIs (Offline Code Flow)',
        'Google Connections',
        `Email: ${connectedEmail} | Refresh Token: ${encryptedRefresh ? 'Stored Encrypted' : 'Preserved/None'} | Scopes: ${grantedScopes.join(', ')}`
      );

      return res.send(
        renderOAuthPopupHtml({
          type: 'GOOGLE_API_OAUTH_SUCCESS',
          message: 'Google API access authorized and encrypted server-side. Returning to TreeWalley SEO Command Center...',
        })
      );
    } catch (err: any) {
      const msg = err instanceof GoogleApiError ? err.message : sanitizeGoogleDetail(err?.message || 'OAuth exchange failed');
      const code = err instanceof GoogleApiError ? err.mapped.errorCode : 'oauth_exchange_failed';
      await logActivity(statePayload.uid, statePayload.email, 'Google OAuth Exchange Failed', 'Google Connections', msg, 'error');
      return res.status(502).send(
        renderOAuthPopupHtml({
          type: 'GOOGLE_API_OAUTH_ERROR',
          errorCode: code,
          message: msg,
        })
      );
    }
  });

  app.post('/api/connections/google', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { accessToken, scopes, connectedEmail } = req.body || {};
      if (!accessToken || typeof accessToken !== 'string') {
        return res.status(400).json({ error: 'Google OAuth access token is required.' });
      }

      // Verify genuine token & granted scopes directly with Google tokeninfo
      const tokenInfo = await verifyGoogleTokenInfo(accessToken);
      if (!tokenInfo.valid) {
        return res.status(401).json({
          error: 'Google rejected the supplied OAuth access token during verification. Please re-authorize.',
          errorCode: tokenInfo.errorCode || 'invalid_token',
        });
      }

      const verifiedScopes = tokenInfo.scopes.length > 0
        ? tokenInfo.scopes
        : Array.isArray(scopes)
        ? scopes
        : [];
      const verifiedEmail = tokenInfo.email || connectedEmail || req.adminEmail;
      const encrypted = encryptToken(accessToken);
      const ttlSeconds = tokenInfo.expiresInSec ? Math.max(60, tokenInfo.expiresInSec - 60) : 3300;
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      const existing = await db
        .select()
        .from(oauthConnections)
        .where(and(eq(oauthConnections.userUid, uid), eq(oauthConnections.provider, 'google')))
        .limit(1);

      let record;
      if (existing.length > 0) {
        [record] = await db
          .update(oauthConnections)
          .set({
            oauthMode: 'firebase_popup',
            connectedEmail: verifiedEmail,
            scopesJson: verifiedScopes,
            encryptedAccessToken: encrypted,
            tokenExpiresAt: expiresAt,
            status: 'connected',
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(oauthConnections.id, existing[0].id))
          .returning();
      } else {
        [record] = await db
          .insert(oauthConnections)
          .values({
            userUid: uid,
            provider: 'google',
            oauthMode: 'firebase_popup',
            connectedEmail: verifiedEmail,
            scopesJson: verifiedScopes,
            encryptedAccessToken: encrypted,
            tokenExpiresAt: expiresAt,
            status: 'connected',
          })
          .returning();
      }

      const diagResult = await runGoogleDiagnostics({
        uid,
        adminEmail: req.adminEmail!,
        target: 'all',
        headerToken: accessToken,
      });

      await logActivity(
        uid,
        req.adminEmail!,
        'Connected Google Services',
        'Google Connections',
        `Verified scopes: ${verifiedScopes.join(', ')}`
      );

      res.json({
        connection: {
          status: record.status,
          oauthMode: record.oauthMode,
          hasRefreshToken: Boolean(record.encryptedRefreshToken),
          connectedEmail: record.connectedEmail,
          scopesJson: verifiedScopes,
          tokenExpiresAt: record.tokenExpiresAt,
          diagnosticsJson: diagResult.snapshot,
          updatedAt: record.updatedAt,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to store encrypted Google connection.' });
    }
  });

  app.post('/api/connections/google/revoke', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const [conn] = await db
        .select()
        .from(oauthConnections)
        .where(and(eq(oauthConnections.userUid, uid), eq(oauthConnections.provider, 'google')))
        .limit(1);

      const accessTok = decryptToken(conn?.encryptedAccessToken);
      const refreshTok = decryptToken(conn?.encryptedRefreshToken);
      const tokenToRevoke = refreshTok || accessTok;

      if (tokenToRevoke) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`, {
          method: 'POST',
        }).catch(() => null);
      }

      const [settings] = await db.select().from(adminSettings).where(eq(adminSettings.userUid, uid)).limit(1);
      const resetDiag = defaultDiagnosticsSnapshot(req.adminEmail!, Boolean(settings?.trendsApiApproved));

      await db
        .update(oauthConnections)
        .set({
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          tokenExpiresAt: null,
          scopesJson: [],
          status: 'disconnected',
          lastError: null,
          diagnosticsJson: resetDiag,
          updatedAt: new Date(),
        })
        .where(and(eq(oauthConnections.userUid, uid), eq(oauthConnections.provider, 'google')));

      await logActivity(uid, req.adminEmail!, 'Revoked Google OAuth Access', 'Google Connections', 'Disconnected and wiped encrypted access & refresh tokens');
      res.json({ status: 'disconnected', diagnostics: resetDiag });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to revoke access.' });
    }
  });

  // 2B. Google Integration Diagnostics Panel & Google Cloud Configuration Checker
  app.get('/api/diagnostics/status', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const [settings] = await db.select().from(adminSettings).where(eq(adminSettings.userUid, uid)).limit(1);
      const [conn] = await db
        .select()
        .from(oauthConnections)
        .where(and(eq(oauthConnections.userUid, uid), eq(oauthConnections.provider, 'google')))
        .limit(1);

      const defaults = defaultDiagnosticsSnapshot(req.adminEmail!, Boolean(settings?.trendsApiApproved));
      const diagnostics = conn?.diagnosticsJson ? { ...defaults, ...conn.diagnosticsJson } : defaults;

      // Always keep trends flag synced with latest adminSettings
      diagnostics.trends = {
        ...defaults.trends,
        lastTestedAt: diagnostics.trends?.lastTestedAt || defaults.trends.lastTestedAt,
      };

      // Check token expiry status accurately without faking Connected
      if (conn && conn.tokenExpiresAt && new Date(conn.tokenExpiresAt).getTime() <= Date.now() && !conn.encryptedRefreshToken) {
        if (diagnostics.blogger.status === 'Connected') {
          diagnostics.blogger = {
            ...diagnostics.blogger,
            status: 'Token Expired',
            permissionOk: false,
            lastErrorCode: 'token_expired',
            lastErrorMessage: 'Temporary access token expired. Click Reconnect or configure GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET for automatic refresh.',
          };
        }
        if (diagnostics.searchConsole.status === 'Connected') {
          diagnostics.searchConsole = {
            ...diagnostics.searchConsole,
            status: 'Token Expired',
            permissionOk: false,
            lastErrorCode: 'token_expired',
            lastErrorMessage: 'Temporary access token expired. Click Reconnect or configure GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET for automatic refresh.',
          };
        }
      }

      const publicBaseUrl = getPublicBaseUrl(req);
      const checklist = buildCloudConfigChecklist({
        publicBaseUrl,
        conn,
        diagnostics,
        settings,
      });

      res.json({
        oauthMode: conn ? (conn.oauthMode as 'oauth_code_offline' | 'firebase_popup') : 'none',
        hasRefreshToken: Boolean(conn?.encryptedRefreshToken),
        tokenExpiresAt: conn?.tokenExpiresAt ? new Date(conn.tokenExpiresAt).toISOString() : null,
        connectedEmail: conn?.connectedEmail || null,
        grantedScopes: conn?.scopesJson || [],
        diagnostics,
        ...checklist,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load integration diagnostics.' });
    }
  });

  app.post('/api/diagnostics/test', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const target = (req.body?.service || 'all') as 'all' | 'login' | 'blogger' | 'searchConsole' | 'trends';
      const headerToken = typeof req.headers['x-google-access-token'] === 'string'
        ? req.headers['x-google-access-token']
        : null;

      const { snapshot, conn, tokenRes } = await runGoogleDiagnostics({
        uid,
        adminEmail: req.adminEmail!,
        target,
        headerToken,
      });

      const [settings] = await db.select().from(adminSettings).where(eq(adminSettings.userUid, uid)).limit(1);
      const checklist = buildCloudConfigChecklist({
        publicBaseUrl: getPublicBaseUrl(req),
        conn,
        diagnostics: snapshot,
        settings,
      });

      await logActivity(
        uid,
        req.adminEmail!,
        `Tested Google Integration (${target})`,
        'Google Connections',
        `Blogger: ${snapshot.blogger.status} | GSC: ${snapshot.searchConsole.status} | Trends: ${snapshot.trends.status}`
      );

      res.json({
        oauthMode: tokenRes.oauthMode,
        hasRefreshToken: tokenRes.hasRefreshToken,
        tokenExpiresAt: tokenRes.expiresAt ? tokenRes.expiresAt.toISOString() : null,
        connectedEmail: tokenRes.connectedEmail,
        grantedScopes: tokenRes.scopes,
        diagnostics: snapshot,
        ...checklist,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Diagnostics check failed.' });
    }
  });

  // 3. Google Search Console & Overview Dashboard
  app.get('/api/gsc/sites', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const token = await requireGoogleToken(req, res);
      if (!token) return;
      const sites = await listGscSites(token);
      res.json({ sites });
    } catch (error: any) {
      sendGoogleError(res, error, 'Failed to list Search Console properties.');
    }
  });

  app.post('/api/gsc/sync', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const token = await requireGoogleToken(req, res);
      if (!token) return;
      const [settings] = await db
        .select()
        .from(adminSettings)
        .where(eq(adminSettings.userUid, uid))
        .limit(1);

      const siteUrl = req.body?.siteUrl || settings?.searchConsoleSiteUrl || 'https://www.treewalley.com/';
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      let startDate = typeof req.body?.startDate === 'string' && dateRegex.test(req.body.startDate) ? req.body.startDate : '';
      let endDate = typeof req.body?.endDate === 'string' && dateRegex.test(req.body.endDate) ? req.body.endDate : '';

      if (!startDate || !endDate) {
        const days = Math.min(365, Math.max(1, Number(req.body?.days) || 28));
        const end = new Date(Date.now() - 2 * 86400000); // GSC data typically lags ~48h
        const start = new Date(end.getTime() - days * 86400000);
        startDate = start.toISOString().slice(0, 10);
        endDate = end.toISOString().slice(0, 10);
      }

      if (req.body?.siteUrl && settings && req.body.siteUrl !== settings.searchConsoleSiteUrl) {
        await db
          .update(adminSettings)
          .set({ searchConsoleSiteUrl: req.body.siteUrl, updatedAt: new Date() })
          .where(eq(adminSettings.userUid, uid))
          .catch(() => null);
      }

      const [dateRows, queryRows, pageRows, deviceRows, countryRows] = await Promise.all([
        queryGscSearchAnalytics(token, siteUrl, { startDate, endDate, dimensions: ['date'], rowLimit: 90 }),
        queryGscSearchAnalytics(token, siteUrl, { startDate, endDate, dimensions: ['query', 'page'], rowLimit: 100 }),
        queryGscSearchAnalytics(token, siteUrl, { startDate, endDate, dimensions: ['page'], rowLimit: 50 }),
        queryGscSearchAnalytics(token, siteUrl, { startDate, endDate, dimensions: ['device'], rowLimit: 10 }),
        queryGscSearchAnalytics(token, siteUrl, { startDate, endDate, dimensions: ['country'], rowLimit: 25 }),
      ]);

      const dailyTrend = dateRows.map((r) => ({
        date: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Number((r.ctr * 100).toFixed(2)),
        position: Number(r.position.toFixed(1)),
      }));

      const totalClicks = dailyTrend.reduce((sum, d) => sum + d.clicks, 0);
      const totalImpressions = dailyTrend.reduce((sum, d) => sum + d.impressions, 0);
      const avgCtr = totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
      const avgPosition =
        dailyTrend.length > 0
          ? Number((dailyTrend.reduce((s, d) => s + d.position, 0) / dailyTrend.length).toFixed(1))
          : 0;

      const topQueries = queryRows.map((r) => ({
        query: r.keys[0],
        page: r.keys[1] || '',
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Number((r.ctr * 100).toFixed(2)),
        position: Number(r.position.toFixed(1)),
      }));

      const topPages = pageRows.map((r) => ({
        page: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Number((r.ctr * 100).toFixed(2)),
        position: Number(r.position.toFixed(1)),
      }));

      const devices = deviceRows.map((r) => ({
        device: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Number((r.ctr * 100).toFixed(2)),
        position: Number(r.position.toFixed(1)),
      }));

      const countries = countryRows.map((r) => ({
        country: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Number((r.ctr * 100).toFixed(2)),
        position: Number(r.position.toFixed(1)),
      }));

      const [snapshot] = await db
        .insert(gscSnapshots)
        .values({
          userUid: uid,
          siteUrl,
          dateRangeStart: startDate,
          dateRangeEnd: endDate,
          totalClicks,
          totalImpressions,
          avgCtr,
          avgPosition,
          dailyTrendJson: dailyTrend,
          topPagesJson: topPages,
          topQueriesJson: topQueries,
          devicesJson: devices,
          countriesJson: countries,
        })
        .returning();

      // Persist rank history entries for Rank Tracker
      if (topQueries.length > 0) {
        await db.insert(rankHistory).values(
          topQueries.slice(0, 60).map((q) => ({
            userUid: uid,
            keyword: q.query,
            landingPage: q.page || siteUrl,
            date: endDate,
            avgPosition: q.position,
            clicks: q.clicks,
            impressions: q.impressions,
            ctr: q.ctr,
            country: 'ALL',
            device: 'ALL',
            bucket: bucketForPosition(q.position),
          }))
        );
      }

      await logActivity(uid, req.adminEmail!, 'Synced Search Console', 'Overview', `${siteUrl} (${startDate} to ${endDate}): ${totalClicks} clicks, ${totalImpressions} impressions`);
      res.json({ snapshot });
    } catch (error: any) {
      sendGoogleError(res, error, 'Search Console sync failed.');
    }
  });

  app.get('/api/overview', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const [latestGsc, previousGsc] = await db
        .select()
        .from(gscSnapshots)
        .where(eq(gscSnapshots.userUid, uid))
        .orderBy(desc(gscSnapshots.syncedAt))
        .limit(2);

      const allArticles = await db
        .select({
          id: articles.id,
          title: articles.title,
          status: articles.status,
          seoScore: articles.seoScore,
          languageName: articles.languageName,
          blogCategory: articles.blogCategory,
          updatedAt: articles.updatedAt,
        })
        .from(articles)
        .where(eq(articles.userUid, uid))
        .orderBy(desc(articles.updatedAt))
        .limit(10);

      const inspections = await db
        .select()
        .from(indexInspections)
        .where(eq(indexInspections.userUid, uid))
        .orderBy(desc(indexInspections.inspectedAt))
        .limit(50);

      const indexedCount = inspections.filter((i) => i.verdict === 'PASS').length;
      const notIndexedCount = inspections.filter((i) => i.verdict !== 'PASS').length;

      res.json({
        latestGsc: latestGsc || null,
        previousGsc: previousGsc || null,
        articlesSummary: {
          recent: allArticles,
          totalCount: allArticles.length,
        },
        indexSummary: {
          totalInspected: inspections.length,
          indexedCount,
          notIndexedCount,
          issues: inspections.filter((i) => i.verdict !== 'PASS').slice(0, 6),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load dashboard overview.' });
    }
  });

  // 4. Keyword Research Engine (Strictly Separated Data Sources)
  app.get('/api/keywords', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const rows = await db
        .select()
        .from(keywords)
        .where(eq(keywords.userUid, uid))
        .orderBy(desc(keywords.updatedAt));
      res.json({ keywords: rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load saved keywords.' });
    }
  });

  app.post('/api/keywords/research', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { seed, searchType, country, region, language, listName } = req.body || {};
      if (!seed || !String(seed).trim()) {
        return res.status(400).json({ error: 'Enter a keyword, product name, URL, or seed list.' });
      }

      const [settings] = await db
        .select()
        .from(adminSettings)
        .where(eq(adminSettings.userUid, uid))
        .limit(1);

      // 1. Semantic keyword expansion & intent via Gemini (no fabricated volume)
      const expanded = await analyzeKeywordExpansion({
        seed: String(seed).trim(),
        searchType: searchType || 'keyword',
        country: country || 'India',
        region: region || 'All India',
        language: language || 'English',
      });

      // 2. Check latest Search Console snapshot for actual GSC clicks/impressions/position
      const [latestGsc] = await db
        .select()
        .from(gscSnapshots)
        .where(eq(gscSnapshots.userUid, uid))
        .orderBy(desc(gscSnapshots.syncedAt))
        .limit(1);

      const gscQueryMap = new Map<string, { clicks: number; impressions: number; ctr: number; position: number; page?: string }>();
      for (const q of latestGsc?.topQueriesJson || []) {
        gscQueryMap.set(q.query.toLowerCase(), q as any);
      }

      // 3. Optionally query Google Ads Keyword Planner if developer token + customer ID + OAuth token exist
      const adsMap = new Map<string, { avgMonthly: number; competition: string; competitionIndex: number; history: Array<{ month: string; searches: number }> }>();
      let adsApiStatus = 'Google Ads Keyword Planner not configured';
      const token = await getGoogleAccessToken(req);
      const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      if (token && devToken && settings?.googleAdsCustomerId) {
        try {
          const adsResults = await fetchGoogleAdsKeywordIdeas({
            accessToken: token,
            customerId: settings.googleAdsCustomerId,
            developerToken: devToken,
            keywords: expanded.map((k) => k.keyword).slice(0, 10),
          });
          adsApiStatus = 'Live Google Ads Keyword Planner';
          for (const item of adsResults) {
            const text = String(item.text || '').toLowerCase();
            const metrics = item.keywordIdeaMetrics || {};
            adsMap.set(text, {
              avgMonthly: Number(metrics.avgMonthlySearches) || 0,
              competition: String(metrics.competition || 'UNSPECIFIED'),
              competitionIndex: Number(metrics.competitionIndex) || 0,
              history: (metrics.monthlySearchVolumes || []).map((m: any) => ({
                month: `${m.year}-${m.month}`,
                searches: Number(m.monthlySearches) || 0,
              })),
            });
          }
        } catch (adsErr: any) {
          adsApiStatus = `Google Ads API error: ${adsErr.message}`;
        }
      }

      // 4. Match latest Trends snapshots if imported
      const userTrends = await db
        .select()
        .from(trendSnapshots)
        .where(eq(trendSnapshots.userUid, uid))
        .orderBy(desc(trendSnapshots.importedAt))
        .limit(20);

      const inserted = [];
      for (const item of expanded) {
        const lower = item.keyword.toLowerCase();
        const gscMatch = gscQueryMap.get(lower);
        const adsMatch = adsMap.get(lower);
        const trendMatch = userTrends.find((t) => t.keyword.toLowerCase() === lower);
        const latestTrendScore = trendMatch?.interestSeriesJson?.slice(-1)[0]?.value ?? null;

        // Calculate grounded opportunity score only from available signals
        let oppScore = Math.round(item.relevanceScore * 0.55);
        if (gscMatch) {
          if (gscMatch.impressions > 50 && gscMatch.position > 4 && gscMatch.position <= 20) oppScore += 25;
          else if (gscMatch.impressions > 0) oppScore += 15;
        }
        if (adsMatch && adsMatch.avgMonthly > 0) {
          oppScore += adsMatch.competition === 'LOW' ? 20 : 10;
        }
        oppScore = Math.min(100, oppScore);

        const sourceParts: string[] = [];
        if (adsMatch) sourceParts.push('Google Ads Live');
        if (gscMatch) sourceParts.push('GSC Live');
        if (trendMatch) sourceParts.push('Trends Import');
        if (sourceParts.length === 0) sourceParts.push('Gemini Semantic (Volumes Unconnected)');

        const [saved] = await db
          .insert(keywords)
          .values({
            userUid: uid,
            keyword: item.keyword,
            seedSource: String(seed).trim(),
            country: country || 'India',
            region: region || 'All India',
            language: language || 'English',
            listName: listName || 'Core Solid Wood',
            adsAvgMonthlySearches: adsMatch ? adsMatch.avgMonthly : null,
            adsCompetitionLevel: adsMatch ? adsMatch.competition : null,
            adsCompetitionIndex: adsMatch ? adsMatch.competitionIndex : null,
            adsHistoricalJson: adsMatch ? adsMatch.history : null,
            trendsInterestScore: latestTrendScore,
            trendsDirection: trendMatch?.seasonalNote || null,
            gscClicks: gscMatch ? gscMatch.clicks : null,
            gscImpressions: gscMatch ? gscMatch.impressions : null,
            gscCtr: gscMatch ? gscMatch.ctr : null,
            gscAvgPosition: gscMatch ? gscMatch.position : null,
            gscLandingPage: gscMatch?.page || null,
            commercialIntent: item.commercialIntent,
            informationalIntent: item.informationalIntent,
            relatedKeywordsJson: item.relatedKeywords,
            longTailKeywordsJson: item.longTailKeywords,
            suggestedTopic: item.suggestedTopic,
            opportunityScore: oppScore,
            dataSourceLabel: sourceParts.join(' + '),
            saved: true,
          })
          .returning();
        inserted.push(saved);
      }

      await logActivity(uid, req.adminEmail!, 'Researched Keywords', 'Keyword Research', `Seed: "${seed}" -> ${inserted.length} keywords`);
      res.json({ keywords: inserted, adsApiStatus });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Keyword research failed.' });
    }
  });

  app.put('/api/keywords/:id', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [updated] = await db
        .update(keywords)
        .set({
          listName: req.body?.listName,
          saved: req.body?.saved ?? true,
          adsAvgMonthlySearches: req.body?.adsAvgMonthlySearches ?? undefined,
          adsCompetitionLevel: req.body?.adsCompetitionLevel ?? undefined,
          updatedAt: new Date(),
        })
        .where(and(eq(keywords.id, id), eq(keywords.userUid, req.user!.uid)))
        .returning();
      res.json({ keyword: updated });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to update keyword.' });
    }
  });

  app.delete('/api/keywords/:id', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(keywords).where(and(eq(keywords.id, id), eq(keywords.userUid, req.user!.uid)));
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to delete keyword.' });
    }
  });

  // 5. Google Trends Explorer (Official API Status + Manual CSV/JSON Import Workflow)
  app.get('/api/trends', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .select()
        .from(trendSnapshots)
        .where(eq(trendSnapshots.userUid, req.user!.uid))
        .orderBy(desc(trendSnapshots.importedAt));
      res.json({ trends: rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load trends.' });
    }
  });

  app.post('/api/trends/import', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { category, keyword, country, region, timeframe, csvText, risingQueriesText } = req.body || {};
      if (!keyword || !category) {
        return res.status(400).json({ error: 'Category and keyword are required.' });
      }

      // Parse official Google Trends CSV export format (Week/Month, Interest)
      const interestSeries: Array<{ date: string; value: number }> = [];
      if (typeof csvText === 'string' && csvText.trim()) {
        const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (line.startsWith('Category:') || line.startsWith('Week') || line.startsWith('Month') || line.startsWith('Day')) {
            continue;
          }
          const parts = line.split(',');
          if (parts.length >= 2) {
            const val = parseInt(parts[1].replace('<1', '1'), 10);
            if (!Number.isNaN(val) && parts[0]) {
              interestSeries.push({ date: parts[0], value: val });
            }
          }
        }
      }

      const risingQueries: Array<{ query: string; growth: string }> = [];
      if (typeof risingQueriesText === 'string' && risingQueriesText.trim()) {
        for (const line of risingQueriesText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
          const [q, growth] = line.split(',').map((s) => s.trim());
          if (q) risingQueries.push({ query: q, growth: growth || 'Rising' });
        }
      }

      const aiTopics = await generateTrendTopics({
        category,
        risingQueries: risingQueries.map((r) => r.query),
        country: country || 'India',
      });

      const [saved] = await db
        .insert(trendSnapshots)
        .values({
          userUid: uid,
          category,
          keyword,
          country: country || 'India',
          region: region || 'All Regions',
          timeframe: timeframe || '12m',
          interestSeriesJson: interestSeries,
          regionInterestJson: region ? [{ region, value: interestSeries.slice(-1)[0]?.value || 0 }] : [],
          risingQueriesJson: risingQueries,
          relatedTopicsJson: [category, keyword],
          discoveredTopicsJson: aiTopics.topics,
          seasonalNote: aiTopics.seasonalNote,
          sourceType: 'manual_csv_import',
        })
        .returning();

      await logActivity(uid, req.adminEmail!, 'Imported Google Trends Export', 'Trends', `${keyword} (${interestSeries.length} data points)`);
      res.json({ trend: saved });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to import Google Trends data.' });
    }
  });

  // 6. Rank Tracker (Real Search Console Average Position)
  app.get('/api/ranks', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const rows = await db
        .select()
        .from(rankHistory)
        .where(eq(rankHistory.userUid, uid))
        .orderBy(desc(rankHistory.date), desc(rankHistory.impressions))
        .limit(300);
      res.json({ ranks: rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load ranking history.' });
    }
  });

  // 7. Blog Writer Studio & Articles CRUD + SEO Validation
  app.get('/api/articles', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .select()
        .from(articles)
        .where(eq(articles.userUid, req.user!.uid))
        .orderBy(desc(articles.updatedAt));
      res.json({ articles: rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load articles.' });
    }
  });

  app.post('/api/articles/generate', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const b = req.body || {};
      if (!b.topic || !b.primaryKeyword) {
        return res.status(400).json({ error: 'Blog topic and primary keyword are required.' });
      }

      const langObj = LANGUAGES_350.find((l) => l.code === b.languageCode) || LANGUAGES_350[0];
      const userLinks = await db.select().from(internalLinks).where(eq(internalLinks.userUid, uid));
      const userRefs = await db.select().from(externalReferences).where(eq(externalReferences.userUid, uid));
      const userMedia = await db.select().from(mediaAssets).where(eq(mediaAssets.userUid, uid));

      const selectedMediaIds: number[] = Array.isArray(b.selectedMediaIds) ? b.selectedMediaIds : [];
      const chosenMedia = selectedMediaIds.length
        ? userMedia.filter((m) => selectedMediaIds.includes(m.id))
        : userMedia
            .filter((m) => m.category.toLowerCase() === String(b.blogCategory || '').toLowerCase())
            .slice(0, 2);
      const finalMedia = chosenMedia.length ? chosenMedia : userMedia.slice(0, 1);

      const selectedInternalUrls: string[] = Array.isArray(b.internalLinks) ? b.internalLinks : [];
      const chosenInternal = selectedInternalUrls.length
        ? userLinks.filter((l) => selectedInternalUrls.includes(l.url))
        : userLinks.slice(0, 4);

      const approvedExternal = userRefs.filter((r) => r.approved).slice(0, 3);

      const generated = await generateSeoArticle({
        topic: b.topic,
        primaryKeyword: b.primaryKeyword,
        secondaryKeywords: Array.isArray(b.secondaryKeywords)
          ? b.secondaryKeywords
          : String(b.secondaryKeywords || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
        targetCountry: b.targetCountry || 'India',
        targetAudience: b.targetAudience || 'Indian homeowners & interior designers',
        languageCode: langObj.code,
        languageName: langObj.name,
        regionalVariation: b.regionalVariation || langObj.region,
        wordCount: Number(b.wordCount) || 1200,
        mode: b.mode || 'SEO Buying Guide',
        writingStyle: b.writingStyle || 'Premium editorial',
        blogCategory: b.blogCategory || 'Wooden beds',
        productLinks: Array.isArray(b.productLinks)
          ? b.productLinks
          : String(b.productLinks || 'https://www.treewalley.com/')
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
        internalLinks: chosenInternal.map((l) => ({ url: l.url, title: l.title })),
        externalReferences: approvedExternal.map((r) => ({
          url: r.url,
          title: r.title,
          publisher: r.publisher,
        })),
        selectedImages: finalMedia.map((m) => ({
          url: m.webpUrl || m.publicUrl,
          alt: m.altText,
          caption: m.caption || undefined,
        })),
      });

      const existingArticles = await db
        .select({
          id: articles.id,
          title: articles.title,
          primaryKeyword: articles.primaryKeyword,
          contentHtml: articles.contentHtml,
        })
        .from(articles)
        .where(eq(articles.userUid, uid));

      const imagesAttached = finalMedia.map((m, idx) => ({
        url: m.webpUrl || m.publicUrl,
        alt: generated.imageAlts[idx]?.alt || m.altText,
        caption: generated.imageAlts[idx]?.caption || m.caption || '',
        width: m.width,
        height: m.height,
      }));

      const usedInternal = chosenInternal.map((l) => ({
        url: l.url,
        anchor: l.title,
        valid: l.httpStatus ? l.httpStatus >= 200 && l.httpStatus < 400 : true,
      }));
      const usedExternal = approvedExternal.map((r) => ({
        url: r.url,
        title: r.title,
        valid: r.httpStatus ? r.httpStatus >= 200 && r.httpStatus < 400 : true,
      }));

      const validation = validateArticleSeo({
        title: generated.blogTitle,
        seoTitle: generated.seoTitle,
        metaDescription: generated.metaDescription,
        primaryKeyword: generated.localizedPrimaryKeyword || b.primaryKeyword,
        secondaryKeywords: generated.localizedSecondaryKeywords,
        contentHtml: generated.contentHtml,
        internalLinks: usedInternal,
        externalLinks: usedExternal,
        images: imagesAttached,
        existingArticles,
      });

      const [saved] = await db
        .insert(articles)
        .values({
          userUid: uid,
          title: generated.blogTitle,
          seoTitle: generated.seoTitle,
          slug: `${generated.slug}-${Date.now().toString(36).slice(-4)}`,
          metaDescription: generated.metaDescription,
          primaryKeyword: generated.localizedPrimaryKeyword || b.primaryKeyword,
          secondaryKeywordsJson: generated.localizedSecondaryKeywords,
          languageCode: langObj.code,
          languageName: langObj.name,
          regionalVariation: b.regionalVariation || langObj.region,
          targetCountry: b.targetCountry || 'India',
          mode: b.mode || 'SEO Buying Guide',
          writingStyle: b.writingStyle || 'Premium editorial',
          blogCategory: b.blogCategory || 'Wooden beds',
          targetAudience: b.targetAudience || 'Indian homeowners',
          wordCountTarget: Number(b.wordCount) || 1200,
          wordCountActual: validation.wordCountActual,
          contentHtml: generated.contentHtml,
          faqJson: generated.faq,
          internalLinksJson: usedInternal,
          externalLinksJson: usedExternal,
          featuredImageUrl: imagesAttached[0]?.url || null,
          imagesJson: imagesAttached,
          labelsJson: [b.blogCategory || 'Solid Wood', langObj.name, 'TreeWalley'],
          seoScore: validation.score,
          seoAuditJson: { score: validation.score, checks: validation.checks },
          cannibalizationWarning: validation.cannibalizationWarning,
          duplicateScore: validation.duplicateScore,
          languageReliabilityFlag: langObj.reliability,
          status: 'draft',
        })
        .returning();

      await logActivity(uid, req.adminEmail!, 'Generated AI SEO Article', 'Blog Writer', `${saved.title} (${langObj.name}, SEO ${saved.seoScore}/100)`);
      res.json({ article: saved, relatedArticleIdeas: generated.relatedArticleIdeas });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Article generation failed.' });
    }
  });

  app.put('/api/articles/:id', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const id = Number(req.params.id);
      const b = req.body || {};

      const existingArticles = await db
        .select({
          id: articles.id,
          title: articles.title,
          primaryKeyword: articles.primaryKeyword,
          contentHtml: articles.contentHtml,
        })
        .from(articles)
        .where(eq(articles.userUid, uid));

      const [current] = await db
        .select()
        .from(articles)
        .where(and(eq(articles.id, id), eq(articles.userUid, uid)))
        .limit(1);
      if (!current) return res.status(404).json({ error: 'Article not found.' });

      const nextTitle = b.title ?? current.title;
      const nextSeoTitle = b.seoTitle ?? current.seoTitle;
      const nextMeta = b.metaDescription ?? current.metaDescription;
      const nextPrimary = b.primaryKeyword ?? current.primaryKeyword;
      const nextSecondary = b.secondaryKeywordsJson ?? current.secondaryKeywordsJson;
      const nextHtml = b.contentHtml ?? current.contentHtml;
      const nextInternal = b.internalLinksJson ?? current.internalLinksJson;
      const nextExternal = b.externalLinksJson ?? current.externalLinksJson;
      const nextImages = b.imagesJson ?? current.imagesJson;

      const validation = validateArticleSeo({
        articleId: id,
        title: nextTitle,
        seoTitle: nextSeoTitle,
        metaDescription: nextMeta,
        primaryKeyword: nextPrimary,
        secondaryKeywords: nextSecondary,
        contentHtml: nextHtml,
        internalLinks: nextInternal,
        externalLinks: nextExternal,
        images: nextImages,
        existingArticles,
      });

      const [updated] = await db
        .update(articles)
        .set({
          title: nextTitle,
          seoTitle: nextSeoTitle,
          slug: b.slug ?? current.slug,
          metaDescription: nextMeta,
          primaryKeyword: nextPrimary,
          secondaryKeywordsJson: nextSecondary,
          contentHtml: nextHtml,
          faqJson: b.faqJson ?? current.faqJson,
          internalLinksJson: nextInternal,
          externalLinksJson: nextExternal,
          featuredImageUrl: b.featuredImageUrl ?? nextImages[0]?.url ?? current.featuredImageUrl,
          imagesJson: nextImages,
          labelsJson: b.labelsJson ?? current.labelsJson,
          status: b.status ?? current.status,
          scheduledFor: b.scheduledFor ? new Date(b.scheduledFor) : current.scheduledFor,
          wordCountActual: validation.wordCountActual,
          seoScore: validation.score,
          seoAuditJson: { score: validation.score, checks: validation.checks },
          cannibalizationWarning: validation.cannibalizationWarning,
          duplicateScore: validation.duplicateScore,
          updatedAt: new Date(),
        })
        .where(and(eq(articles.id, id), eq(articles.userUid, uid)))
        .returning();

      res.json({ article: updated });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to update article.' });
    }
  });

  app.delete('/api/articles/:id', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(articles).where(and(eq(articles.id, id), eq(articles.userUid, req.user!.uid)));
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to delete article.' });
    }
  });

  // 8. Bulk Blog Generation Engine (1 to 300 jobs, background worker, draft-only safety)
  app.get('/api/bulk-jobs', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .select()
        .from(bulkJobs)
        .where(eq(bulkJobs.userUid, req.user!.uid))
        .orderBy(desc(bulkJobs.createdAt));
      res.json({ jobs: rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load bulk jobs.' });
    }
  });

  app.post('/api/bulk-jobs', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { batchName, requestedCount, seedTopics, category, languageCode, mode, writingStyle, concurrency } =
        req.body || {};

      const count = Math.max(1, Math.min(300, Number(requestedCount) || 5));
      const langObj = LANGUAGES_350.find((l) => l.code === languageCode) || LANGUAGES_350[0];
      const baseCategory = category || 'Wooden beds';

      const inputLines = String(seedTopics || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const topicsList = Array.from({ length: count }, (_, idx) => {
        const raw = inputLines[idx % Math.max(1, inputLines.length)];
        const topic = raw
          ? inputLines.length >= count
            ? raw
            : `${raw} — Regional Guide #${idx + 1}`
          : `Complete ${baseCategory} Buying & Craftsmanship Guide for Indian Homes #${idx + 1}`;
        const kw = raw ? raw.toLowerCase().slice(0, 60) : `${baseCategory.toLowerCase()} india guide ${idx + 1}`;
        return {
          topic,
          primaryKeyword: kw,
          category: baseCategory,
          status: 'queued',
        };
      });

      const [job] = await db
        .insert(bulkJobs)
        .values({
          userUid: uid,
          batchName: batchName || `TreeWalley ${baseCategory} Batch (${count})`,
          requestedCount: count,
          status: 'queued',
          topicsJson: topicsList,
          languageCode: langObj.code,
          languageName: langObj.name,
          mode: mode || 'SEO Buying Guide',
          writingStyle: writingStyle || 'Premium editorial',
          concurrency: Math.max(1, Math.min(5, Number(concurrency) || 3)),
        })
        .returning();

      // Start background worker asynchronously
      setImmediate(() => {
        startBulkJobRunner(job.id, uid);
      });

      await logActivity(uid, req.adminEmail!, 'Started Bulk Generation Job', 'Bulk Generator', `${count} drafts queued in ${langObj.name}`);
      res.json({ job });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to enqueue bulk job.' });
    }
  });

  app.post('/api/bulk-jobs/:id/pause', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [updated] = await db
        .update(bulkJobs)
        .set({ status: 'paused' })
        .where(and(eq(bulkJobs.id, id), eq(bulkJobs.userUid, req.user!.uid)))
        .returning();
      res.json({ job: updated });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to pause job.' });
    }
  });

  app.post('/api/bulk-jobs/:id/resume', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const uid = req.user!.uid;
      const [updated] = await db
        .update(bulkJobs)
        .set({ status: 'queued' })
        .where(and(eq(bulkJobs.id, id), eq(bulkJobs.userUid, uid)))
        .returning();
      if (updated) {
        setImmediate(() => startBulkJobRunner(updated.id, uid));
      }
      res.json({ job: updated });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to resume job.' });
    }
  });

  app.post('/api/bulk-jobs/batch-action', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { articleIds, action, scheduledStartIso } = req.body || {};
      if (!Array.isArray(articleIds) || articleIds.length === 0) {
        return res.status(400).json({ error: 'Select one or more articles.' });
      }

      const [settings] = await db
        .select()
        .from(adminSettings)
        .where(eq(adminSettings.userUid, uid))
        .limit(1);
      const threshold = settings?.minSeoScoreThreshold ?? 75;

      const selected = await db
        .select()
        .from(articles)
        .where(and(eq(articles.userUid, uid), inArray(articles.id, articleIds)));

      const updated = [];
      const skipped: Array<{ id: number; title: string; reason: string }> = [];

      for (let i = 0; i < selected.length; i++) {
        const art = selected[i];
        if ((action === 'approve' || action === 'schedule') && art.seoScore < threshold) {
          skipped.push({
            id: art.id,
            title: art.title,
            reason: `SEO score ${art.seoScore}/100 is below threshold ${threshold}`,
          });
          continue;
        }
        if ((action === 'approve' || action === 'schedule') && art.cannibalizationWarning) {
          skipped.push({
            id: art.id,
            title: art.title,
            reason: art.cannibalizationWarning,
          });
          continue;
        }

        const nextStatus =
          action === 'approve'
            ? 'approved'
            : action === 'schedule'
            ? 'scheduled'
            : action === 'pending_approval'
            ? 'pending_approval'
            : 'draft';

        const scheduledFor =
          action === 'schedule'
            ? new Date((scheduledStartIso ? new Date(scheduledStartIso).getTime() : Date.now()) + i * 86400000)
            : art.scheduledFor;

        const [row] = await db
          .update(articles)
          .set({ status: nextStatus, scheduledFor, updatedAt: new Date() })
          .where(eq(articles.id, art.id))
          .returning();
        updated.push(row);
      }

      await logActivity(uid, req.adminEmail!, `Batch ${action}`, 'Bulk Generator', `${updated.length} updated, ${skipped.length} skipped by quality gate`);
      res.json({ updated, skipped });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Batch action failed.' });
    }
  });

  // 9. Image Library & Automatic Optimization (WebP, Resizing, Compression, AI Alt Text)
  app.get('/api/media', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.userUid, req.user!.uid))
        .orderBy(desc(mediaAssets.createdAt));
      res.json({ media: rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load media library.' });
    }
  });

  app.post('/api/media/upload', requireAdminAuth, upload.array('files', 12), async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        return res.status(400).json({ error: 'No image files uploaded.' });
      }

      const category = req.body?.category || 'Wooden beds';
      const isTreeWalleyProduct = req.body?.isTreeWalleyProduct !== 'false';
      const productUrl = req.body?.productUrl || null;
      const targetWidth = Math.min(2000, Math.max(400, Number(req.body?.maxWidth) || 1200));

      const savedAssets = [];

      for (const file of files) {
        const aiMeta = await generateImageMetadata({
          originalName: file.originalname,
          category,
          isTreeWalleyProduct,
        }).catch(() => ({
          seoFilename: `${file.originalname.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webp`,
          altText: `${category} handcrafted solid wood furniture by TreeWalley`,
          caption: `${category} showcase`,
        }));

        const slugBase = aiMeta.seoFilename.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]+/g, '-');
        const uniqueSuffix = Date.now().toString(36);
        const webpName = `${slugBase}-${uniqueSuffix}.webp`;
        const webpPath = path.join(UPLOADS_DIR, webpName);

        const pipeline = sharp(file.buffer).rotate().resize({ width: targetWidth, withoutEnlargement: true });
        const webpBuffer = await pipeline.webp({ quality: 82 }).toBuffer();
        const meta = await sharp(webpBuffer).metadata();
        fs.writeFileSync(webpPath, webpBuffer);

        const publicPath = `/media/${webpName}`;

        const [asset] = await db
          .insert(mediaAssets)
          .values({
            userUid: uid,
            filename: webpName,
            seoFilename: webpName,
            originalName: file.originalname,
            category,
            mimeType: 'image/webp',
            width: meta.width || targetWidth,
            height: meta.height || 800,
            sizeBytes: webpBuffer.length,
            publicUrl: publicPath,
            webpUrl: publicPath,
            altText: req.body?.altText || aiMeta.altText,
            caption: req.body?.caption || aiMeta.caption,
            isTreeWalleyProduct,
            productUrl,
            publicVerified: true,
          })
          .returning();
        savedAssets.push(asset);
      }

      await logActivity(uid, req.adminEmail!, 'Uploaded & Optimized Images', 'Image Library', `${savedAssets.length} WebP images saved`);
      res.json({ assets: savedAssets });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Image upload and WebP processing failed.' });
    }
  });

  app.post('/api/media/generate-ai', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { prompt, category } = req.body || {};
      if (!prompt) return res.status(400).json({ error: 'Image prompt is required.' });

      const generated = await generateInspirationImage(prompt);
      const rawBuf = Buffer.from(generated.dataBase64, 'base64');
      const webpBuffer = await sharp(rawBuf).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
      const meta = await sharp(webpBuffer).metadata();
      const filename = `treewalley-inspiration-${Date.now().toString(36)}.webp`;
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), webpBuffer);
      const publicPath = `/media/${filename}`;

      const [asset] = await db
        .insert(mediaAssets)
        .values({
          userUid: uid,
          filename,
          seoFilename: filename,
          originalName: filename,
          category: category || 'Wooden beds',
          mimeType: 'image/webp',
          width: meta.width || 1200,
          height: meta.height || 900,
          sizeBytes: webpBuffer.length,
          publicUrl: publicPath,
          webpUrl: publicPath,
          altText: `${prompt.slice(0, 110)}`,
          caption: 'AI-generated generic solid wood interior inspiration (non-product)',
          isTreeWalleyProduct: false,
          publicVerified: true,
        })
        .returning();

      await logActivity(uid, req.adminEmail!, 'Generated AI Inspiration Image', 'Image Library', filename);
      res.json({ asset });
    } catch (error: any) {
      res.status(400).json({
        error:
          error?.message ||
          'AI image generation requires a billing-enabled Gemini API key in Settings > Secrets.',
      });
    }
  });

  app.post('/api/media/:id/verify', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [asset] = await db
        .select()
        .from(mediaAssets)
        .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userUid, req.user!.uid)))
        .limit(1);
      if (!asset) return res.status(404).json({ error: 'Asset not found.' });

      const baseUrl = getPublicBaseUrl(req);
      const fullUrl = asset.publicUrl.startsWith('http') ? asset.publicUrl : `${baseUrl}${asset.publicUrl}`;
      const status = await verifyHttpUrl(fullUrl);
      const verified = status >= 200 && status < 400;
      const [updated] = await db
        .update(mediaAssets)
        .set({ publicVerified: verified })
        .where(eq(mediaAssets.id, id))
        .returning();
      res.json({ asset: updated, httpStatus: status, fullUrl });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Verification failed.' });
    }
  });

  app.delete('/api/media/:id', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(mediaAssets).where(and(eq(mediaAssets.id, id), eq(mediaAssets.userUid, req.user!.uid)));
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Delete failed.' });
    }
  });

  // 10. Internal Links & XML Sitemap Engine + Authoritative External References
  app.get('/api/links', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const [internal, external] = await Promise.all([
        db.select().from(internalLinks).where(eq(internalLinks.userUid, uid)).orderBy(desc(internalLinks.createdAt)),
        db.select().from(externalReferences).where(eq(externalReferences.userUid, uid)).orderBy(desc(externalReferences.createdAt)),
      ]);
      res.json({ internalLinks: internal, externalReferences: external });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load links.' });
    }
  });

  app.post('/api/links/crawl-sitemap', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const [settings] = await db.select().from(adminSettings).where(eq(adminSettings.userUid, uid)).limit(1);
      const sitemapUrl = req.body?.sitemapUrl || settings?.sitemapUrl || 'https://www.treewalley.com/sitemap.xml';

      const discovered = await crawlXmlSitemap(sitemapUrl, 150);
      const existing = await db.select().from(internalLinks).where(eq(internalLinks.userUid, uid));
      const existingUrls = new Set(existing.map((e) => e.url));

      const toInsert = discovered.filter((d) => !existingUrls.has(d.url));
      if (toInsert.length > 0) {
        await db.insert(internalLinks).values(
          toInsert.map((d) => ({
            userUid: uid,
            url: d.url,
            title: d.title,
            pageType: d.pageType,
            category: d.category,
            keywordsJson: d.keywords,
            source: 'sitemap',
          }))
        );
      }

      await logActivity(uid, req.adminEmail!, 'Crawled XML Sitemap', 'Internal Links', `${discovered.length} URLs found, ${toInsert.length} added`);
      res.json({ totalFound: discovered.length, newlyAdded: toInsert.length });
    } catch (error: any) {
      res.status(502).json({ error: error?.message || 'Sitemap crawl failed.' });
    }
  });

  app.post('/api/links', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const { url, title, pageType, category, keywordsList } = req.body || {};
      if (!url || !title) return res.status(400).json({ error: 'URL and title are required.' });
      const status = await verifyHttpUrl(url);
      const [created] = await db
        .insert(internalLinks)
        .values({
          userUid: req.user!.uid,
          url,
          title,
          pageType: pageType || 'product',
          category: category || 'Solid wood furniture',
          keywordsJson: Array.isArray(keywordsList) ? keywordsList : [],
          httpStatus: status,
          lastCheckedAt: new Date(),
          source: 'manual',
        })
        .returning();
      res.json({ link: created });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to add internal link.' });
    }
  });

  app.post('/api/links/:id/check', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [link] = await db
        .select()
        .from(internalLinks)
        .where(and(eq(internalLinks.id, id), eq(internalLinks.userUid, req.user!.uid)))
        .limit(1);
      if (!link) return res.status(404).json({ error: 'Link not found.' });
      const status = await verifyHttpUrl(link.url);
      const [updated] = await db
        .update(internalLinks)
        .set({ httpStatus: status, lastCheckedAt: new Date() })
        .where(eq(internalLinks.id, id))
        .returning();
      res.json({ link: updated });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Link check failed.' });
    }
  });

  app.delete('/api/links/:id', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      await db.delete(internalLinks).where(and(eq(internalLinks.id, Number(req.params.id)), eq(internalLinks.userUid, req.user!.uid)));
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Delete failed.' });
    }
  });

  app.post('/api/external-refs', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const { url, title, publisher, category } = req.body || {};
      if (!url || !title) return res.status(400).json({ error: 'URL and title are required.' });
      const status = await verifyHttpUrl(url);
      const [created] = await db
        .insert(externalReferences)
        .values({
          userUid: req.user!.uid,
          url,
          title,
          publisher: publisher || 'Authoritative Reference',
          category: category || 'Industry Research',
          approved: true,
          httpStatus: status,
          lastCheckedAt: new Date(),
        })
        .returning();
      res.json({ reference: created });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to add external reference.' });
    }
  });

  app.post('/api/external-refs/:id/check', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [ref] = await db
        .select()
        .from(externalReferences)
        .where(and(eq(externalReferences.id, id), eq(externalReferences.userUid, req.user!.uid)))
        .limit(1);
      if (!ref) return res.status(404).json({ error: 'Reference not found.' });
      const status = await verifyHttpUrl(ref.url);
      const [updated] = await db
        .update(externalReferences)
        .set({ httpStatus: status, lastCheckedAt: new Date() })
        .where(eq(externalReferences.id, id))
        .returning();
      res.json({ reference: updated });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Reference check failed.' });
    }
  });

  app.delete('/api/external-refs/:id', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      await db.delete(externalReferences).where(and(eq(externalReferences.id, Number(req.params.id)), eq(externalReferences.userUid, req.user!.uid)));
      res.json({ deleted: true });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Delete failed.' });
    }
  });

  // 11. Google Blogger v3 Auto Publisher & Logs
  app.get('/api/blogger/blogs', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const token = await requireGoogleToken(req, res);
      if (!token) return;
      const blogs = await listBloggerBlogs(token);
      res.json({ blogs });
    } catch (error: any) {
      sendGoogleError(res, error, 'Failed to fetch Blogger blogs.');
    }
  });

  app.get('/api/blogger/posts', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const token = await requireGoogleToken(req, res);
      if (!token) return;
      const blogId = String(req.query.blogId || '').trim();
      if (!blogId) {
        return res.status(400).json({ error: 'blogId query parameter is required.' });
      }
      const status = (req.query.status as 'live' | 'draft' | 'scheduled' | 'all') || 'all';
      const maxResults = Math.min(50, Math.max(1, Number(req.query.maxResults) || 20));
      const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : undefined;
      const data = await listBloggerPosts(token, blogId, { status, maxResults, pageToken });
      res.json(data);
    } catch (error: any) {
      sendGoogleError(res, error, 'Failed to retrieve Blogger posts.');
    }
  });

  app.get('/api/blogger/posts/:postId', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const token = await requireGoogleToken(req, res);
      if (!token) return;
      const blogId = String(req.query.blogId || '').trim();
      if (!blogId) {
        return res.status(400).json({ error: 'blogId query parameter is required.' });
      }
      const post = await getBloggerPost(token, blogId, String(req.params.postId));
      res.json({ post });
    } catch (error: any) {
      sendGoogleError(res, error, 'Failed to retrieve Blogger post status.');
    }
  });

  app.post('/api/blogger/publish', requireAdminAuth, async (req: AuthRequest, res) => {
    const uid = req.user!.uid;
    const { articleId, blogId, blogName, mode, scheduledIso } = req.body || {};
    try {
      const token = await requireGoogleToken(req, res);
      if (!token) return;
      if (!articleId || !blogId) {
        return res.status(400).json({ error: 'Article ID and destination Blogger blog ID are required.' });
      }

      const [article] = await db
        .select()
        .from(articles)
        .where(and(eq(articles.id, Number(articleId)), eq(articles.userUid, uid)))
        .limit(1);
      if (!article) return res.status(404).json({ error: 'Article not found.' });

      const [settings] = await db.select().from(adminSettings).where(eq(adminSettings.userUid, uid)).limit(1);
      const minScore = settings?.minSeoScoreThreshold ?? 75;
      if (mode === 'publish' && article.seoScore < minScore) {
        return res.status(400).json({
          error: `Article SEO score (${article.seoScore}/100) is below the required threshold (${minScore}/100). Improve SEO checks before publishing.`,
        });
      }

      const baseUrl = getPublicBaseUrl(req);
      const publicHtml = makeAbsoluteHttpsUrls(article.contentHtml, baseUrl);
      const isDraft = mode === 'draft';

      const bloggerPost = await createOrUpdateBloggerPost(token, {
        blogId,
        existingPostId: article.bloggerPostId,
        title: article.title,
        content: publicHtml,
        labels: article.labelsJson || [article.blogCategory],
        isDraft,
        publishedIso: mode === 'schedule' && scheduledIso ? new Date(scheduledIso).toISOString() : undefined,
      });

      const nextStatus =
        mode === 'draft' ? 'draft' : mode === 'schedule' ? 'scheduled' : 'published';

      const [updatedArticle] = await db
        .update(articles)
        .set({
          bloggerBlogId: blogId,
          bloggerPostId: bloggerPost.id,
          bloggerPostUrl: bloggerPost.url || null,
          status: nextStatus,
          publishedAt: nextStatus === 'published' ? new Date() : article.publishedAt,
          scheduledFor: scheduledIso ? new Date(scheduledIso) : article.scheduledFor,
          updatedAt: new Date(),
        })
        .where(eq(articles.id, article.id))
        .returning();

      const [log] = await db
        .insert(publishingLogs)
        .values({
          userUid: uid,
          articleId: article.id,
          articleTitle: article.title,
          bloggerBlogId: blogId,
          bloggerBlogName: blogName || blogId,
          action: article.bloggerPostId ? 'update' : mode || 'publish',
          status: 'success',
          postId: bloggerPost.id,
          publicUrl: bloggerPost.url || null,
        })
        .returning();

      await logActivity(uid, req.adminEmail!, `Blogger ${log.action}`, 'Blogger Publisher', `${article.title} -> ${bloggerPost.url || bloggerPost.id}`);
      res.json({ article: updatedArticle, log, bloggerPost });
    } catch (error: any) {
      await db
        .insert(publishingLogs)
        .values({
          userUid: uid,
          articleId: articleId ? Number(articleId) : null,
          articleTitle: `Article #${articleId}`,
          bloggerBlogId: blogId || 'unknown',
          bloggerBlogName: blogName || null,
          action: mode || 'publish',
          status: 'failed',
          errorDetails: sanitizeGoogleDetail(error?.message || 'Blogger API request failed'),
        })
        .catch(() => null);
      sendGoogleError(res, error, 'Blogger publishing failed.');
    }
  });

  app.get('/api/blogger/logs', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const logs = await db
        .select()
        .from(publishingLogs)
        .where(eq(publishingLogs.userUid, req.user!.uid))
        .orderBy(desc(publishingLogs.createdAt))
        .limit(100);
      res.json({ logs });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load publishing logs.' });
    }
  });

  // 12. Google Index Monitor (Official URL Inspection API + Sitemaps)
  app.get('/api/index-monitor', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .select()
        .from(indexInspections)
        .where(eq(indexInspections.userUid, req.user!.uid))
        .orderBy(desc(indexInspections.inspectedAt))
        .limit(100);
      res.json({ inspections: rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load index inspections.' });
    }
  });

  app.post('/api/index-monitor/inspect', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const token = await requireGoogleToken(req, res);
      if (!token) return;
      const [settings] = await db.select().from(adminSettings).where(eq(adminSettings.userUid, uid)).limit(1);
      const siteUrl = req.body?.siteUrl || settings?.searchConsoleSiteUrl || 'https://www.treewalley.com/';
      const inspectionUrl = req.body?.inspectionUrl;
      if (!inspectionUrl) return res.status(400).json({ error: 'Inspection URL is required.' });

      const result = await inspectGscUrl(token, siteUrl, inspectionUrl);
      const idxStatus = result?.indexStatusResult || {};

      const [saved] = await db
        .insert(indexInspections)
        .values({
          userUid: uid,
          url: inspectionUrl,
          verdict: idxStatus.verdict || 'VERDICT_UNSPECIFIED',
          coverageState: idxStatus.coverageState || 'Unknown',
          indexingState: idxStatus.indexingState || null,
          lastCrawlTime: idxStatus.lastCrawlTime || null,
          crawledAs: idxStatus.crawledAs || null,
          googleCanonical: idxStatus.googleCanonical || null,
          userCanonical: idxStatus.userCanonical || null,
          robotsTxtState: idxStatus.robotsTxtState || null,
          pageFetchState: idxStatus.pageFetchState || null,
          rawResultJson: result,
        })
        .returning();

      await logActivity(uid, req.adminEmail!, 'Inspected URL Index Status', 'Index Monitor', `${inspectionUrl} (${saved.coverageState})`);
      res.json({ inspection: saved });
    } catch (error: any) {
      sendGoogleError(res, error, 'URL Inspection API call failed.');
    }
  });

  app.get('/api/index-monitor/sitemaps', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const token = await requireGoogleToken(req, res);
      if (!token) return;
      const [settings] = await db.select().from(adminSettings).where(eq(adminSettings.userUid, req.user!.uid)).limit(1);
      const siteUrl = (req.query.siteUrl as string) || settings?.searchConsoleSiteUrl || 'https://www.treewalley.com/';
      const sitemaps = await listGscSitemaps(token, siteUrl);
      res.json({ sitemaps });
    } catch (error: any) {
      sendGoogleError(res, error, 'Failed to fetch GSC sitemaps.');
    }
  });

  app.post('/api/index-monitor/submit-sitemap', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const token = await requireGoogleToken(req, res);
      if (!token) return;
      const { siteUrl, feedpath } = req.body || {};
      if (!siteUrl || !feedpath) return res.status(400).json({ error: 'Site URL and Sitemap Feedpath are required.' });
      const result = await submitGscSitemap(token, siteUrl, feedpath);
      await logActivity(req.user!.uid, req.adminEmail!, 'Submitted Sitemap to GSC', 'Index Monitor', feedpath);
      res.json(result);
    } catch (error: any) {
      sendGoogleError(res, error, 'Sitemap submission failed.');
    }
  });

  // 13. Monthly SEO Audit & Reports (19 Sections)
  app.get('/api/audits', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .select()
        .from(auditReports)
        .where(eq(auditReports.userUid, req.user!.uid))
        .orderBy(desc(auditReports.generatedAt));
      res.json({ audits: rows });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load audit reports.' });
    }
  });

  app.post('/api/audits/generate', requireAdminAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const reportMonth = req.body?.reportMonth || new Date().toISOString().slice(0, 7);
      const comparisonWindow = req.body?.comparisonWindow || 'previous_month';

      const [gscList, allKeywords, allArticles, allLinks, allMedia, allInspections] = await Promise.all([
        db.select().from(gscSnapshots).where(eq(gscSnapshots.userUid, uid)).orderBy(desc(gscSnapshots.syncedAt)).limit(2),
        db.select().from(keywords).where(eq(keywords.userUid, uid)),
        db.select().from(articles).where(eq(articles.userUid, uid)),
        db.select().from(internalLinks).where(eq(internalLinks.userUid, uid)),
        db.select().from(mediaAssets).where(eq(mediaAssets.userUid, uid)),
        db.select().from(indexInspections).where(eq(indexInspections.userUid, uid)),
      ]);

      const currentGsc = gscList[0] || null;
      const prevGsc = gscList[1] || null;

      const brokenLinks = allLinks.filter((l) => l.httpStatus !== null && (l.httpStatus === 0 || l.httpStatus >= 400));
      const unoptimizedImages = allMedia.filter((m) => !m.webpUrl || !m.altText || m.altText.length < 10);
      const cannibalizedArticles = allArticles.filter((a) => Boolean(a.cannibalizationWarning));
      const publishedArticles = allArticles.filter((a) => a.status === 'published');
      const topQueries = currentGsc?.topQueriesJson || [];
      const prevQuerySet = new Set((prevGsc?.topQueriesJson || []).map((q) => q.query));
      const newRankingKeywords = topQueries.filter((q) => !prevQuerySet.has(q.query)).slice(0, 15);
      const currentQueryMap = new Map(topQueries.map((q) => [q.query, q]));
      const decliningKeywords = (prevGsc?.topQueriesJson || [])
        .filter((pq) => {
          const cq = currentQueryMap.get(pq.query);
          return !cq || cq.position > pq.position + 1.5;
        })
        .slice(0, 15);

      const factualContext = {
        reportMonth,
        comparisonWindow,
        organicPerformance: currentGsc
          ? {
              clicks: currentGsc.totalClicks,
              impressions: currentGsc.totalImpressions,
              avgCtr: currentGsc.avgCtr,
              avgPosition: currentGsc.avgPosition,
              dateRange: `${currentGsc.dateRangeStart} to ${currentGsc.dateRangeEnd}`,
            }
          : 'Google Search Console not yet synced',
        previousPerformance: prevGsc
          ? {
              clicks: prevGsc.totalClicks,
              impressions: prevGsc.totalImpressions,
              avgCtr: prevGsc.avgCtr,
              avgPosition: prevGsc.avgPosition,
            }
          : null,
        trackedKeywordsCount: allKeywords.length,
        articlesTotal: allArticles.length,
        publishedArticlesCount: publishedArticles.length,
        internalLinksCount: allLinks.length,
        brokenLinksCount: brokenLinks.length,
        mediaCount: allMedia.length,
        unoptimizedImagesCount: unoptimizedImages.length,
        indexedUrlsCount: allInspections.filter((i) => i.verdict === 'PASS').length,
        notIndexedUrlsCount: allInspections.filter((i) => i.verdict !== 'PASS').length,
        cannibalizedCount: cannibalizedArticles.length,
      };

      const aiNarrative = await generateAuditSummaryAndPlan(JSON.stringify(factualContext));

      const sections = {
        executiveSummary: aiNarrative.executiveSummary,
        organicPerformance: factualContext.organicPerformance,
        clickImpressionComparison: {
          current: factualContext.organicPerformance,
          previous: factualContext.previousPerformance,
        },
        averageCtr: currentGsc?.avgCtr ?? null,
        averagePosition: currentGsc?.avgPosition ?? null,
        keywordPerformance: topQueries.slice(0, 20),
        newRankingKeywords,
        lostAndDecliningKeywords: decliningKeywords,
        topPerformingBlogs: (currentGsc?.topPagesJson || []).slice(0, 10),
        lowPerformingBlogs: allArticles.filter((a) => a.seoScore < 75).map((a) => ({ title: a.title, seoScore: a.seoScore, status: a.status })),
        indexingStatus: {
          indexed: factualContext.indexedUrlsCount,
          notIndexed: factualContext.notIndexedUrlsCount,
          inspections: allInspections.slice(0, 20),
        },
        pageCoverage: allInspections.map((i) => ({ url: i.url, coverageState: i.coverageState, verdict: i.verdict })),
        internalLinkingAudit: { totalLinks: allLinks.length, checked: allLinks.filter((l) => l.httpStatus !== null).length },
        brokenLinkAudit: brokenLinks.map((b) => ({ url: b.url, status: b.httpStatus })),
        imageOptimizationAudit: {
          totalImages: allMedia.length,
          webpCount: allMedia.filter((m) => Boolean(m.webpUrl)).length,
          missingAltCount: unoptimizedImages.length,
        },
        technicalSeoWarnings: [
          ...(brokenLinks.length > 0 ? [`${brokenLinks.length} broken internal link(s) detected.`] : []),
          ...(unoptimizedImages.length > 0 ? [`${unoptimizedImages.length} media asset(s) missing WebP or complete ALT text.`] : []),
          ...(currentGsc ? [] : ['Search Console not synced for live organic performance data.']),
        ],
        contentCannibalization: cannibalizedArticles.map((a) => ({ title: a.title, primaryKeyword: a.primaryKeyword, warning: a.cannibalizationWarning })),
        nextMonthContentPlan: aiNarrative.nextMonthContentPlan || [],
        recommendedImprovements: aiNarrative.recommendedImprovements || [],
      };

      const [report] = await db
        .insert(auditReports)
        .values({
          userUid: uid,
          reportMonth,
          comparisonWindow,
          executiveSummary: aiNarrative.executiveSummary || 'Monthly SEO audit generated from live database records.',
          sectionsJson: sections,
        })
        .returning();

      await logActivity(uid, req.adminEmail!, 'Generated Monthly SEO Audit', 'SEO Audit', `Report for ${reportMonth}`);
      res.json({ report });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to generate monthly SEO audit.' });
    }
  });

  // Vite or Static Frontend
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TreeWalley SEO Command Center running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
