import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  adminSettings,
  GoogleDiagnosticsSnapshot,
  GoogleServiceDiagnostic,
  oauthConnections,
} from '../db/schema.ts';
import { decryptToken, encryptToken } from './crypto.ts';
import {
  GoogleApiError,
  listBloggerBlogs,
  listGscSites,
  refreshGoogleAccessToken,
} from './googleApis.ts';
import {
  MappedGoogleError,
  sanitizeGoogleDetail,
  verifyGoogleTokenInfo,
} from './googleErrorMapper.ts';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

export const OAUTH_LOGIN_SCOPES = ['openid', 'email', 'profile'] as const;
export const BLOGGER_SCOPE = 'https://www.googleapis.com/auth/blogger';
export const GSC_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const GSC_FULL_SCOPE = 'https://www.googleapis.com/auth/webmasters';

export function hasBloggerScope(scopes: string[]): boolean {
  return scopes.includes(BLOGGER_SCOPE);
}

export function hasSearchConsoleScope(scopes: string[]): boolean {
  return scopes.includes(GSC_READONLY_SCOPE) || scopes.includes(GSC_FULL_SCOPE);
}

export function isGoogleOAuthClientConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_ID.trim().length > 10 &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CLIENT_SECRET.trim().length > 6
  );
}

export function getExpectedRedirectUri(publicBaseUrl: string): string {
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit && explicit.startsWith('http')) {
    return explicit;
  }
  return `${publicBaseUrl.replace(/\/+$/, '')}/api/oauth/google/callback`;
}

export function defaultDiagnosticsSnapshot(
  adminEmail: string,
  trendsApproved = false
): GoogleDiagnosticsSnapshot {
  return {
    login: {
      service: 'login',
      label: 'Google Login (Admin Session)',
      status: 'Connected',
      connectedEmail: adminEmail,
      requiredScopes: [...OAUTH_LOGIN_SCOPES],
      grantedScopes: [...OAUTH_LOGIN_SCOPES],
      permissionOk: true,
      lastTestedAt: new Date().toISOString(),
      lastHttpStatus: 200,
      lastErrorCode: null,
      lastErrorMessage: null,
      details: 'Authenticated via Firebase Admin ID token & single-admin allowlist.',
    },
    blogger: {
      service: 'blogger',
      label: 'Google Blogger API v3',
      status: 'Authorization Required',
      connectedEmail: null,
      requiredScopes: [BLOGGER_SCOPE],
      grantedScopes: [],
      permissionOk: false,
      lastTestedAt: null,
      lastHttpStatus: null,
      lastErrorCode: null,
      lastErrorMessage: 'Not authorized yet. Connect Google API access with Blogger permissions.',
      details: null,
    },
    searchConsole: {
      service: 'searchConsole',
      label: 'Google Search Console API',
      status: 'Authorization Required',
      connectedEmail: null,
      requiredScopes: [GSC_READONLY_SCOPE],
      grantedScopes: [],
      permissionOk: false,
      lastTestedAt: null,
      lastHttpStatus: null,
      lastErrorCode: null,
      lastErrorMessage: 'Not authorized yet. Connect Google API access with Search Console permissions.',
      details: null,
    },
    trends: {
      service: 'trends',
      label: 'Google Trends',
      status: trendsApproved ? 'Connected' : 'Not Available',
      connectedEmail: null,
      requiredScopes: [],
      grantedScopes: [],
      permissionOk: trendsApproved,
      lastTestedAt: new Date().toISOString(),
      lastHttpStatus: trendsApproved ? 200 : null,
      lastErrorCode: trendsApproved ? null : 'trends_api_unavailable',
      lastErrorMessage: trendsApproved
        ? 'Official Google Trends API flag enabled.'
        : 'Official Google Trends API access is not provisioned by Google for standard projects. Manual CSV import is active in Trends Explorer.',
      details: 'Independent from Blogger and Search Console OAuth.',
    },
  };
}

export interface TokenResolutionResult {
  accessToken: string | null;
  refreshed: boolean;
  oauthMode: 'oauth_code_offline' | 'firebase_popup' | 'none';
  hasRefreshToken: boolean;
  scopes: string[];
  connectedEmail: string | null;
  expiresAt: Date | null;
  error?: MappedGoogleError;
}

export async function resolveGoogleAccessToken(
  uid: string,
  headerToken?: string | null
): Promise<TokenResolutionResult> {
  const [conn] = await db
    .select()
    .from(oauthConnections)
    .where(and(eq(oauthConnections.userUid, uid), eq(oauthConnections.provider, 'google')))
    .limit(1);

  const fallbackHeader =
    typeof headerToken === 'string' && headerToken.trim().length > 15 ? headerToken.trim() : null;

  if (!conn || conn.status === 'disconnected') {
    if (fallbackHeader) {
      return {
        accessToken: fallbackHeader,
        refreshed: false,
        oauthMode: 'firebase_popup',
        hasRefreshToken: false,
        scopes: [],
        connectedEmail: null,
        expiresAt: null,
      };
    }
    return {
      accessToken: null,
      refreshed: false,
      oauthMode: 'none',
      hasRefreshToken: false,
      scopes: [],
      connectedEmail: null,
      expiresAt: null,
      error: {
        status: 'Authorization Required',
        errorCode: 'not_connected',
        httpStatus: 401,
        userMessage: 'Google API access has not been authorized yet. Connect Blogger and Search Console in Google Connections.',
        safeDetail: 'No active Google API token stored.',
      },
    };
  }

  const storedAccess = decryptToken(conn.encryptedAccessToken);
  const storedRefresh = decryptToken(conn.encryptedRefreshToken);
  const hasRefreshToken = Boolean(storedRefresh);
  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
  const isExpiredOrSoon = !expiresAt || expiresAt.getTime() - Date.now() < 120_000;
  const oauthMode =
    conn.oauthMode === 'oauth_code_offline' ? 'oauth_code_offline' : 'firebase_popup';

  if (storedAccess && !isExpiredOrSoon) {
    return {
      accessToken: storedAccess,
      refreshed: false,
      oauthMode,
      hasRefreshToken,
      scopes: conn.scopesJson || [],
      connectedEmail: conn.connectedEmail || null,
      expiresAt,
    };
  }

  // Attempt automatic offline token refresh when refresh token and client credentials exist
  if (storedRefresh && isGoogleOAuthClientConfigured()) {
    try {
      const refreshed = await refreshGoogleAccessToken({
        refreshToken: storedRefresh,
        clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      });

      const nextExpiresAt = new Date(Date.now() + (Number(refreshed.expires_in) || 3500) * 1000);
      const nextScopes = refreshed.scope
        ? refreshed.scope.split(/\s+/).filter(Boolean)
        : conn.scopesJson || [];

      await db
        .update(oauthConnections)
        .set({
          encryptedAccessToken: encryptToken(refreshed.access_token),
          ...(refreshed.refresh_token
            ? { encryptedRefreshToken: encryptToken(refreshed.refresh_token) }
            : {}),
          scopesJson: nextScopes,
          tokenExpiresAt: nextExpiresAt,
          status: 'connected',
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(oauthConnections.id, conn.id));

      return {
        accessToken: refreshed.access_token,
        refreshed: true,
        oauthMode: 'oauth_code_offline',
        hasRefreshToken: true,
        scopes: nextScopes,
        connectedEmail: conn.connectedEmail || null,
        expiresAt: nextExpiresAt,
      };
    } catch (err: any) {
      const mapped: MappedGoogleError =
        err instanceof GoogleApiError
          ? err.mapped
          : {
              status: 'Token Expired',
              errorCode: 'refresh_failed',
              httpStatus: 401,
              userMessage: 'Automatic Google access token refresh failed. Click Reconnect to re-authorize.',
              safeDetail: sanitizeGoogleDetail(err?.message || 'Refresh failed'),
            };

      await db
        .update(oauthConnections)
        .set({
          encryptedAccessToken: null,
          status: mapped.errorCode === 'invalid_grant' ? 'expired' : 'error',
          lastError: mapped.userMessage,
          updatedAt: new Date(),
        })
        .where(eq(oauthConnections.id, conn.id));

      return {
        accessToken: null,
        refreshed: false,
        oauthMode,
        hasRefreshToken,
        scopes: conn.scopesJson || [],
        connectedEmail: conn.connectedEmail || null,
        expiresAt,
        error: mapped,
      };
    }
  }

  // Fallback: if caller passed a fresh non-expired header token, verify & use it
  if (fallbackHeader && fallbackHeader !== storedAccess) {
    return {
      accessToken: fallbackHeader,
      refreshed: false,
      oauthMode,
      hasRefreshToken,
      scopes: conn.scopesJson || [],
      connectedEmail: conn.connectedEmail || null,
      expiresAt,
    };
  }

  return {
    accessToken: null,
    refreshed: false,
    oauthMode,
    hasRefreshToken,
    scopes: conn.scopesJson || [],
    connectedEmail: conn.connectedEmail || null,
    expiresAt,
    error: {
      status: 'Token Expired',
      errorCode: 'token_expired',
      httpStatus: 401,
      userMessage: hasRefreshToken
        ? 'Google access token expired and backend GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured to refresh it automatically.'
        : 'Google access token expired (~1 hour temporary popup token without offline refresh token). Click Reconnect to obtain a fresh token.',
      safeDetail: 'Access token expired.',
    },
  };
}

export async function runGoogleDiagnostics(params: {
  uid: string;
  adminEmail: string;
  target?: 'all' | 'login' | 'blogger' | 'searchConsole' | 'trends';
  headerToken?: string | null;
}) {
  const target = params.target || 'all';
  const [settings] = await db
    .select()
    .from(adminSettings)
    .where(eq(adminSettings.userUid, params.uid))
    .limit(1);

  const [conn] = await db
    .select()
    .from(oauthConnections)
    .where(and(eq(oauthConnections.userUid, params.uid), eq(oauthConnections.provider, 'google')))
    .limit(1);

  const snapshot: GoogleDiagnosticsSnapshot = conn?.diagnosticsJson
    ? { ...defaultDiagnosticsSnapshot(params.adminEmail, Boolean(settings?.trendsApiApproved)), ...conn.diagnosticsJson }
    : defaultDiagnosticsSnapshot(params.adminEmail, Boolean(settings?.trendsApiApproved));

  const tokenRes = await resolveGoogleAccessToken(params.uid, params.headerToken);
  const nowIso = new Date().toISOString();

  // Inspect live tokeninfo when an access token is available
  let liveScopes: string[] = tokenRes.scopes;
  let tokenEmail = tokenRes.connectedEmail;
  let tokenInvalidError: MappedGoogleError | null = null;

  if (tokenRes.accessToken) {
    const info = await verifyGoogleTokenInfo(tokenRes.accessToken);
    if (info.valid) {
      if (info.scopes.length > 0) liveScopes = info.scopes;
      if (info.email) tokenEmail = info.email;
    } else {
      tokenInvalidError = {
        status: 'Token Expired',
        errorCode: info.errorCode || 'invalid_token',
        httpStatus: 401,
        userMessage: 'Stored Google OAuth access token failed tokeninfo validation (expired or revoked). Click Reconnect.',
        safeDetail: info.errorMessage || 'invalid_token',
      };
    }
  }

  // 1. Login diagnostic
  if (target === 'all' || target === 'login') {
    snapshot.login = {
      service: 'login',
      label: 'Google Login (Admin Session)',
      status: 'Connected',
      connectedEmail: params.adminEmail,
      requiredScopes: [...OAUTH_LOGIN_SCOPES],
      grantedScopes: [...OAUTH_LOGIN_SCOPES],
      permissionOk: true,
      lastTestedAt: nowIso,
      lastHttpStatus: 200,
      lastErrorCode: null,
      lastErrorMessage: null,
      details: `Signed in as authorized admin ${params.adminEmail}.`,
    };
  }

  // 2. Blogger API diagnostic
  if (target === 'all' || target === 'blogger') {
    const grantedForBlogger = liveScopes.filter((s) => s.includes('blogger'));
    if (!tokenRes.accessToken) {
      const err = tokenRes.error;
      snapshot.blogger = {
        service: 'blogger',
        label: 'Google Blogger API v3',
        status: err?.status || 'Authorization Required',
        connectedEmail: tokenEmail,
        requiredScopes: [BLOGGER_SCOPE],
        grantedScopes: grantedForBlogger,
        permissionOk: false,
        lastTestedAt: nowIso,
        lastHttpStatus: err?.httpStatus || null,
        lastErrorCode: err?.errorCode || 'not_connected',
        lastErrorMessage: err?.userMessage || 'Blogger API authorization required.',
        details: err?.safeDetail || null,
      };
    } else if (tokenInvalidError) {
      snapshot.blogger = {
        service: 'blogger',
        label: 'Google Blogger API v3',
        status: tokenInvalidError.status,
        connectedEmail: tokenEmail,
        requiredScopes: [BLOGGER_SCOPE],
        grantedScopes: grantedForBlogger,
        permissionOk: false,
        lastTestedAt: nowIso,
        lastHttpStatus: tokenInvalidError.httpStatus,
        lastErrorCode: tokenInvalidError.errorCode,
        lastErrorMessage: tokenInvalidError.userMessage,
        details: tokenInvalidError.safeDetail,
      };
    } else if (!hasBloggerScope(liveScopes)) {
      snapshot.blogger = {
        service: 'blogger',
        label: 'Google Blogger API v3',
        status: 'Permission Missing',
        connectedEmail: tokenEmail,
        requiredScopes: [BLOGGER_SCOPE],
        grantedScopes: grantedForBlogger,
        permissionOk: false,
        lastTestedAt: nowIso,
        lastHttpStatus: 403,
        lastErrorCode: 'insufficientPermissions',
        lastErrorMessage: `Missing required scope ${BLOGGER_SCOPE}. Reconnect and grant Blogger permission.`,
        details: `Granted scopes: ${liveScopes.join(', ') || 'none'}`,
      };
    } else {
      try {
        const blogs = await listBloggerBlogs(tokenRes.accessToken);
        snapshot.blogger = {
          service: 'blogger',
          label: 'Google Blogger API v3',
          status: 'Connected',
          connectedEmail: tokenEmail,
          requiredScopes: [BLOGGER_SCOPE],
          grantedScopes: grantedForBlogger,
          permissionOk: true,
          lastTestedAt: nowIso,
          lastHttpStatus: 200,
          lastErrorCode: null,
          lastErrorMessage: null,
          details:
            blogs.length > 0
              ? `Verified ${blogs.length} blog(s): ${blogs.map((b) => `${b.name} (${b.id})`).join(', ')}`
              : 'API call succeeded (HTTP 200), but 0 blogs were found for this Google account on blogger.com.',
        };
      } catch (err: any) {
        const mapped = err instanceof GoogleApiError ? err.mapped : null;
        snapshot.blogger = {
          service: 'blogger',
          label: 'Google Blogger API v3',
          status: mapped?.status || 'Connection Failed',
          connectedEmail: tokenEmail,
          requiredScopes: [BLOGGER_SCOPE],
          grantedScopes: grantedForBlogger,
          permissionOk: false,
          lastTestedAt: nowIso,
          lastHttpStatus: mapped?.httpStatus || 502,
          lastErrorCode: mapped?.errorCode || 'blogger_test_failed',
          lastErrorMessage: mapped?.userMessage || sanitizeGoogleDetail(err?.message),
          details: mapped?.safeDetail || sanitizeGoogleDetail(err?.message),
        };
      }
    }
  }

  // 3. Google Search Console API diagnostic
  if (target === 'all' || target === 'searchConsole') {
    const grantedForGsc = liveScopes.filter((s) => s.includes('webmasters'));
    if (!tokenRes.accessToken) {
      const err = tokenRes.error;
      snapshot.searchConsole = {
        service: 'searchConsole',
        label: 'Google Search Console API',
        status: err?.status || 'Authorization Required',
        connectedEmail: tokenEmail,
        requiredScopes: [GSC_READONLY_SCOPE],
        grantedScopes: grantedForGsc,
        permissionOk: false,
        lastTestedAt: nowIso,
        lastHttpStatus: err?.httpStatus || null,
        lastErrorCode: err?.errorCode || 'not_connected',
        lastErrorMessage: err?.userMessage || 'Search Console API authorization required.',
        details: err?.safeDetail || null,
      };
    } else if (tokenInvalidError) {
      snapshot.searchConsole = {
        service: 'searchConsole',
        label: 'Google Search Console API',
        status: tokenInvalidError.status,
        connectedEmail: tokenEmail,
        requiredScopes: [GSC_READONLY_SCOPE],
        grantedScopes: grantedForGsc,
        permissionOk: false,
        lastTestedAt: nowIso,
        lastHttpStatus: tokenInvalidError.httpStatus,
        lastErrorCode: tokenInvalidError.errorCode,
        lastErrorMessage: tokenInvalidError.userMessage,
        details: tokenInvalidError.safeDetail,
      };
    } else if (!hasSearchConsoleScope(liveScopes)) {
      snapshot.searchConsole = {
        service: 'searchConsole',
        label: 'Google Search Console API',
        status: 'Permission Missing',
        connectedEmail: tokenEmail,
        requiredScopes: [GSC_READONLY_SCOPE],
        grantedScopes: grantedForGsc,
        permissionOk: false,
        lastTestedAt: nowIso,
        lastHttpStatus: 403,
        lastErrorCode: 'insufficientPermissions',
        lastErrorMessage: `Missing Search Console scope (${GSC_READONLY_SCOPE} or ${GSC_FULL_SCOPE}). Reconnect and grant permission.`,
        details: `Granted scopes: ${liveScopes.join(', ') || 'none'}`,
      };
    } else {
      try {
        const sites = await listGscSites(tokenRes.accessToken);
        const configuredSite = settings?.searchConsoleSiteUrl || '';
        const matched = sites.find((s) => s.siteUrl === configuredSite);
        snapshot.searchConsole = {
          service: 'searchConsole',
          label: 'Google Search Console API',
          status: 'Connected',
          connectedEmail: tokenEmail,
          requiredScopes: [GSC_READONLY_SCOPE],
          grantedScopes: grantedForGsc,
          permissionOk: true,
          lastTestedAt: nowIso,
          lastHttpStatus: 200,
          lastErrorCode: null,
          lastErrorMessage: null,
          details:
            sites.length > 0
              ? `Verified ${sites.length} property(ies): ${sites.map((s) => `${s.siteUrl} [${s.permissionLevel}]`).join(', ')}${
                  configuredSite && !matched ? ` (Configured property "${configuredSite}" not in returned list — select a verified property in Overview)` : ''
                }`
              : 'API call succeeded (HTTP 200), but 0 verified Search Console properties were found for this account.',
        };
      } catch (err: any) {
        const mapped = err instanceof GoogleApiError ? err.mapped : null;
        snapshot.searchConsole = {
          service: 'searchConsole',
          label: 'Google Search Console API',
          status: mapped?.status || 'Connection Failed',
          connectedEmail: tokenEmail,
          requiredScopes: [GSC_READONLY_SCOPE],
          grantedScopes: grantedForGsc,
          permissionOk: false,
          lastTestedAt: nowIso,
          lastHttpStatus: mapped?.httpStatus || 502,
          lastErrorCode: mapped?.errorCode || 'gsc_test_failed',
          lastErrorMessage: mapped?.userMessage || sanitizeGoogleDetail(err?.message),
          details: mapped?.safeDetail || sanitizeGoogleDetail(err?.message),
        };
      }
    }
  }

  // 4. Google Trends diagnostic
  if (target === 'all' || target === 'trends') {
    const trendsApproved = Boolean(settings?.trendsApiApproved);
    snapshot.trends = {
      service: 'trends',
      label: 'Google Trends',
      status: trendsApproved ? 'Connected' : 'Not Available',
      connectedEmail: null,
      requiredScopes: [],
      grantedScopes: [],
      permissionOk: trendsApproved,
      lastTestedAt: nowIso,
      lastHttpStatus: trendsApproved ? 200 : null,
      lastErrorCode: trendsApproved ? null : 'trends_api_unavailable',
      lastErrorMessage: trendsApproved
        ? 'Official Google Trends API access enabled in Admin Settings.'
        : 'Google does not provide a public self-serve Google Trends API for standard GCP projects. Manual Google Trends CSV import is active in Trends Explorer.',
      details: 'Trends status is isolated from Blogger & Search Console.',
    };
  }

  if (conn) {
    await db
      .update(oauthConnections)
      .set({
        diagnosticsJson: snapshot,
        ...(liveScopes.length > 0 ? { scopesJson: liveScopes } : {}),
        ...(tokenEmail ? { connectedEmail: tokenEmail } : {}),
        updatedAt: new Date(),
      })
      .where(eq(oauthConnections.id, conn.id));
  }

  return { snapshot, conn, tokenRes };
}

export function buildCloudConfigChecklist(params: {
  publicBaseUrl: string;
  conn: typeof oauthConnections.$inferSelect | undefined;
  diagnostics: GoogleDiagnosticsSnapshot;
  settings: typeof adminSettings.$inferSelect | undefined;
}) {
  const oauthEnvConfigured = isGoogleOAuthClientConfigured();
  const redirectUri = getExpectedRedirectUri(params.publicBaseUrl);
  const devRedirect = 'https://ais-dev-cjgvnyilfs3r2ieylmknt2-595835052452.asia-east1.run.app/api/oauth/google/callback';
  const sharedRedirect = 'https://ais-pre-cjgvnyilfs3r2ieylmknt2-595835052452.asia-east1.run.app/api/oauth/google/callback';
  const expectedRedirectUris = Array.from(new Set([redirectUri, devRedirect, sharedRedirect]));
  const expectedOrigins = Array.from(
    new Set([
      params.publicBaseUrl.replace(/\/+$/, ''),
      'https://ais-dev-cjgvnyilfs3r2ieylmknt2-595835052452.asia-east1.run.app',
      'https://ais-pre-cjgvnyilfs3r2ieylmknt2-595835052452.asia-east1.run.app',
    ])
  );

  const missingSecrets: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID?.trim()) missingSecrets.push('GOOGLE_CLIENT_ID');
  if (!process.env.GOOGLE_CLIENT_SECRET?.trim()) missingSecrets.push('GOOGLE_CLIENT_SECRET');

  const bloggerStatus = params.diagnostics.blogger.status;
  const gscStatus = params.diagnostics.searchConsole.status;

  const configChecks = [
    {
      id: 'oauth_client_id',
      label: 'Google OAuth Client ID (Offline Code Flow)',
      status: process.env.GOOGLE_CLIENT_ID?.trim() ? 'ok' : 'missing',
      value: process.env.GOOGLE_CLIENT_ID?.trim()
        ? `${process.env.GOOGLE_CLIENT_ID.trim().slice(0, 18)}...`
        : `Missing GOOGLE_CLIENT_ID (Firebase popup fallback uses ${firebaseConfig.oAuthClientId})`,
      detail:
        'Required on backend for Authorization Code Flow with offline refresh tokens. Add GOOGLE_CLIENT_ID in Environment Secrets.',
    },
    {
      id: 'oauth_client_secret',
      label: 'Google OAuth Client Secret (Backend Only)',
      status: process.env.GOOGLE_CLIENT_SECRET?.trim() ? 'ok' : 'missing',
      value: process.env.GOOGLE_CLIENT_SECRET?.trim() ? 'Configured (server-side secret)' : 'Missing GOOGLE_CLIENT_SECRET',
      detail:
        'Required on backend to exchange authorization codes and automatically refresh expired access tokens. Never exposed to frontend.',
    },
    {
      id: 'redirect_uri',
      label: 'Exact OAuth Callback / Redirect URI',
      status: oauthEnvConfigured ? 'ok' : 'warning',
      value: redirectUri,
      detail: `Must be registered verbatim under Authorized Redirect URIs in Google Cloud Console: ${expectedRedirectUris.join(' | ')}`,
    },
    {
      id: 'scopes',
      label: 'Requested OAuth Scopes',
      status:
        hasBloggerScope(params.conn?.scopesJson || []) &&
        hasSearchConsoleScope(params.conn?.scopesJson || [])
          ? 'ok'
          : 'warning',
      value: `Login: openid, email, profile | Blogger: ${BLOGGER_SCOPE} | GSC: ${GSC_READONLY_SCOPE}`,
      detail: 'All API scopes are requested separately from Login so sign-in never masks missing API permissions.',
    },
    {
      id: 'blogger_api',
      label: 'Blogger API v3 Enabled in GCP',
      status:
        bloggerStatus === 'Connected'
          ? 'ok'
          : bloggerStatus === 'API Not Enabled'
          ? 'missing'
          : 'untested',
      value: bloggerStatus,
      detail:
        bloggerStatus === 'API Not Enabled'
          ? 'Enable "Blogger API" (blogger.googleapis.com) in Google Cloud Console > APIs & Services > Library.'
          : 'Verified dynamically via GET https://www.googleapis.com/blogger/v3/users/self/blogs.',
    },
    {
      id: 'gsc_api',
      label: 'Google Search Console API Enabled in GCP',
      status:
        gscStatus === 'Connected'
          ? 'ok'
          : gscStatus === 'API Not Enabled'
          ? 'missing'
          : 'untested',
      value: gscStatus,
      detail:
        gscStatus === 'API Not Enabled'
          ? 'Enable "Google Search Console API" (searchconsole.googleapis.com) in Google Cloud Console > APIs & Services > Library.'
          : 'Verified dynamically via GET https://www.googleapis.com/webmasters/v3/sites.',
    },
    {
      id: 'blogger_account',
      label: 'Blogger Account & Blog Permissions',
      status:
        bloggerStatus === 'Connected'
          ? params.diagnostics.blogger.details?.includes('0 blogs')
            ? 'warning'
            : 'ok'
          : bloggerStatus === 'Permission Missing'
          ? 'missing'
          : 'untested',
      value: params.diagnostics.blogger.details || bloggerStatus,
      detail: 'Connected Google account must own or have Admin/Author role on the Blogger blog.',
    },
    {
      id: 'gsc_property',
      label: 'Search Console Property Verification & Access',
      status:
        gscStatus === 'Connected'
          ? params.diagnostics.searchConsole.details?.includes('0 verified')
            ? 'warning'
            : 'ok'
          : gscStatus === 'Permission Missing'
          ? 'missing'
          : 'untested',
      value: params.settings?.searchConsoleSiteUrl || 'Not selected',
      detail: params.diagnostics.searchConsole.details || 'Connected Google account must be Verified Owner/User in Search Console.',
    },
  ] as const;

  return {
    oauthEnvConfigured,
    expectedRedirectUris,
    expectedOrigins,
    missingSecrets,
    configChecks: [...configChecks],
  };
}
