import type { GoogleServiceDiagnostic } from '../db/schema.ts';

export type MappedDiagnosticStatus = GoogleServiceDiagnostic['status'];

export interface MappedGoogleError {
  status: MappedDiagnosticStatus;
  errorCode: string;
  httpStatus: number;
  userMessage: string;
  safeDetail: string;
}

export function sanitizeGoogleDetail(input: unknown): string {
  const raw = typeof input === 'string' ? input : JSON.stringify(input ?? '');
  return raw
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[REDACTED_ACCESS_TOKEN]')
    .replace(/1\/\/[A-Za-z0-9._-]+/g, '[REDACTED_REFRESH_TOKEN]')
    .replace(/GOCSPX-[A-Za-z0-9._-]+/g, '[REDACTED_CLIENT_SECRET]')
    .slice(0, 500);
}

export function mapGoogleApiError(
  httpStatus: number,
  rawBody: any,
  context?: { service?: 'blogger' | 'searchConsole' | 'oauth' | 'ads' | 'ga4'; oauthError?: string }
): MappedGoogleError {
  const serviceLabel =
    context?.service === 'blogger'
      ? 'Google Blogger API v3'
      : context?.service === 'searchConsole'
      ? 'Google Search Console API'
      : 'Google API';

  const errorObj = rawBody?.error && typeof rawBody.error === 'object' ? rawBody.error : null;
  const oauthError =
    context?.oauthError ||
    (typeof rawBody?.error === 'string' ? rawBody.error : '') ||
    '';
  const rawMessage: string =
    errorObj?.message ||
    rawBody?.error_description ||
    rawBody?.message ||
    (typeof rawBody === 'string' ? rawBody : '') ||
    '';
  const reasons: string[] = Array.isArray(errorObj?.errors)
    ? errorObj.errors.map((e: any) => String(e?.reason || '')).filter(Boolean)
    : [];
  const detailsReasons: string[] = Array.isArray(errorObj?.details)
    ? errorObj.details.map((d: any) => String(d?.reason || '')).filter(Boolean)
    : [];
  const allReasons = [...reasons, ...detailsReasons].map((r) => r.toLowerCase());
  const lowerMsg = rawMessage.toLowerCase();
  const lowerOAuth = oauthError.toLowerCase();
  const safeDetail = sanitizeGoogleDetail(rawMessage || oauthError || `HTTP ${httpStatus}`);

  // 1. redirect_uri_mismatch
  if (lowerOAuth === 'redirect_uri_mismatch' || lowerMsg.includes('redirect_uri_mismatch')) {
    return {
      status: 'Configuration Error',
      errorCode: 'redirect_uri_mismatch',
      httpStatus: httpStatus || 400,
      userMessage:
        'Google OAuth redirect_uri_mismatch: The callback URL sent by the backend does not exactly match an Authorized Redirect URI in Google Cloud Console > Credentials > OAuth 2.0 Client.',
      safeDetail,
    };
  }

  // 2. origin_mismatch
  if (lowerOAuth === 'origin_mismatch' || lowerMsg.includes('origin_mismatch')) {
    return {
      status: 'Configuration Error',
      errorCode: 'origin_mismatch',
      httpStatus: httpStatus || 400,
      userMessage:
        'Google OAuth origin_mismatch: Add the exact app origin (scheme + domain, no trailing slash) to Authorized JavaScript Origins in Google Cloud Console.',
      safeDetail,
    };
  }

  // 3. invalid_client
  if (lowerOAuth === 'invalid_client' || lowerMsg.includes('invalid_client') || lowerMsg.includes('oauth client was not found')) {
    return {
      status: 'Configuration Error',
      errorCode: 'invalid_client',
      httpStatus: httpStatus || 401,
      userMessage:
        'Google OAuth invalid_client: Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET match the active Web Application OAuth client in Google Cloud Console.',
      safeDetail,
    };
  }

  // 4. access_denied
  if (lowerOAuth === 'access_denied' || lowerMsg.includes('access_denied')) {
    return {
      status: 'Authorization Required',
      errorCode: 'access_denied',
      httpStatus: httpStatus || 403,
      userMessage:
        'Google OAuth access_denied: Consent was cancelled or your Google account is not listed under Test Users on the OAuth Consent Screen (while app is in Testing mode).',
      safeDetail,
    };
  }

  // 5. invalid_grant (expired/revoked refresh token or used/expired auth code)
  if (lowerOAuth === 'invalid_grant' || lowerMsg.includes('invalid_grant') || lowerMsg.includes('token has been expired or revoked')) {
    return {
      status: 'Token Expired',
      errorCode: 'invalid_grant',
      httpStatus: httpStatus || 400,
      userMessage:
        'Google OAuth invalid_grant: The refresh token or authorization code expired or was revoked in Google Account Security. Click Reconnect to re-authorize.',
      safeDetail,
    };
  }

  // 6. accessNotConfigured / API Not Enabled
  if (
    allReasons.includes('accessnotconfigured') ||
    allReasons.includes('service_disabled') ||
    lowerMsg.includes('has not been used in project') ||
    lowerMsg.includes('is disabled') ||
    lowerMsg.includes('accessnotconfigured')
  ) {
    return {
      status: 'API Not Enabled',
      errorCode: 'accessNotConfigured',
      httpStatus: httpStatus || 403,
      userMessage: `${serviceLabel} is not enabled in your Google Cloud project (accessNotConfigured). Enable the API in Google Cloud Console > APIs & Services > Library and wait 1-2 minutes.`,
      safeDetail,
    };
  }

  // 7. insufficientPermissions / insufficient authentication scopes
  if (
    allReasons.includes('insufficientpermissions') ||
    allReasons.includes('insufficient_scope') ||
    lowerMsg.includes('insufficient authentication scopes') ||
    lowerMsg.includes('insufficient permission')
  ) {
    return {
      status: 'Permission Missing',
      errorCode: 'insufficientPermissions',
      httpStatus: httpStatus || 403,
      userMessage: `${serviceLabel} permission missing (insufficientPermissions): The authorized Google token does not include the required scope. Re-authorize and approve all checkboxes.`,
      safeDetail,
    };
  }

  // 8. 401 Unauthorized
  if (httpStatus === 401) {
    return {
      status: 'Token Expired',
      errorCode: '401_unauthorized',
      httpStatus: 401,
      userMessage: `${serviceLabel} returned 401 Unauthorized: Access token is missing, invalid, or expired. Reconnect your Google account.`,
      safeDetail,
    };
  }

  // 9. 403 Forbidden (account/property access missing even when scope granted)
  if (httpStatus === 403) {
    const hint =
      context?.service === 'searchConsole'
        ? 'Ensure the connected Google account has Verified Owner/Full/Restricted access to the selected property in Google Search Console.'
        : context?.service === 'blogger'
        ? 'Ensure the connected Google account owns or has Author/Admin permissions on a Blogger blog at blogger.com.'
        : 'Verify account permissions in Google Cloud Console and the target Google service.';
    return {
      status: 'Permission Missing',
      errorCode: '403_forbidden',
      httpStatus: 403,
      userMessage: `${serviceLabel} returned 403 Forbidden: ${hint}`,
      safeDetail,
    };
  }

  // 10. 404 Not Found
  if (httpStatus === 404) {
    const hint =
      context?.service === 'blogger'
        ? 'Blog ID or Post ID was not found on Blogger.'
        : context?.service === 'searchConsole'
        ? 'Search Console property URL was not found or exact URL prefix/domain syntax (sc-domain:treewalley.com vs https://www.treewalley.com/) does not match.'
        : 'Requested Google resource was not found.';
    return {
      status: 'Connection Failed',
      errorCode: '404_not_found',
      httpStatus: 404,
      userMessage: `${serviceLabel} returned 404 Not Found: ${hint}`,
      safeDetail,
    };
  }

  return {
    status: 'Connection Failed',
    errorCode: oauthError || `http_${httpStatus || 'error'}`,
    httpStatus: httpStatus || 500,
    userMessage: `${serviceLabel} request failed (HTTP ${httpStatus || 'unknown'}).`,
    safeDetail,
  };
}

export interface TokenInfoResult {
  valid: boolean;
  email: string | null;
  expiresInSec: number | null;
  scopes: string[];
  errorCode: string | null;
  errorMessage: string | null;
}

export async function verifyGoogleTokenInfo(accessToken: string): Promise<TokenInfoResult> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/tokeninfo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: accessToken }).toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        valid: false,
        email: null,
        expiresInSec: null,
        scopes: [],
        errorCode: String(body?.error || `http_${res.status}`),
        errorMessage: sanitizeGoogleDetail(body?.error_description || 'Token verification failed'),
      };
    }
    const scopes = typeof body?.scope === 'string'
      ? body.scope.split(/\s+/).map((s: string) => s.trim()).filter(Boolean)
      : [];
    const expiresInSec = body?.expires_in ? Number(body.expires_in) : null;
    return {
      valid: true,
      email: typeof body?.email === 'string' ? body.email : null,
      expiresInSec: Number.isFinite(expiresInSec) ? expiresInSec : null,
      scopes,
      errorCode: null,
      errorMessage: null,
    };
  } catch (err: any) {
    return {
      valid: false,
      email: null,
      expiresInSec: null,
      scopes: [],
      errorCode: 'network_error',
      errorMessage: sanitizeGoogleDetail(err?.message || 'Unable to verify Google token'),
    };
  }
}
