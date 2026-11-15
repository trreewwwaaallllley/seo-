import { MappedGoogleError, mapGoogleApiError } from './googleErrorMapper.ts';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

export class GoogleApiError extends Error {
  public readonly httpStatus: number;
  public readonly mapped: MappedGoogleError;

  constructor(httpStatus: number, mapped: MappedGoogleError) {
    super(`${mapped.userMessage}${mapped.safeDetail ? ` (${mapped.safeDetail})` : ''}`);
    this.name = 'GoogleApiError';
    this.httpStatus = httpStatus;
    this.mapped = mapped;
  }
}

export async function fetchWithBackoff(
  url: string,
  init: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 600;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        if (attempt < maxAttempts) {
          const jitter = Math.floor(Math.random() * 200);
          await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1) + jitter));
          continue;
        }
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Network request failed after retries.');
}

async function parseGoogleResponse(
  res: Response,
  service: 'blogger' | 'searchConsole' | 'oauth' | 'ads' | 'ga4'
) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mapped = mapGoogleApiError(res.status, body, { service });
    throw new GoogleApiError(res.status, mapped);
  }
  return body;
}

// 0. Google OAuth 2.0 Authorization Code Exchange, Refresh & UserInfo
export async function exchangeGoogleAuthCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const res = await fetchWithBackoff('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  const body = await parseGoogleResponse(res, 'oauth');
  return body as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
  };
}

export async function refreshGoogleAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const res = await fetchWithBackoff('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const body = await parseGoogleResponse(res, 'oauth');
  return body as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const res = await fetchWithBackoff('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseGoogleResponse(res, 'oauth');
  return body as { sub?: string; email?: string; email_verified?: boolean; name?: string };
}

// 1. Google Search Console API — Verified Sites
export async function listGscSites(accessToken: string) {
  const res = await fetchWithBackoff('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await parseGoogleResponse(res, 'searchConsole');
  return (body.siteEntry || []) as Array<{ siteUrl: string; permissionLevel: string }>;
}

// 2. Google Search Console API — Search Analytics Query
export async function queryGscSearchAnalytics(
  accessToken: string,
  siteUrl: string,
  params: {
    startDate: string;
    endDate: string;
    dimensions: Array<'date' | 'query' | 'page' | 'country' | 'device'>;
    rowLimit?: number;
  }
) {
  const encodedSite = encodeURIComponent(siteUrl);
  const res = await fetchWithBackoff(
    `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: params.startDate,
        endDate: params.endDate,
        dimensions: params.dimensions,
        rowLimit: params.rowLimit ?? 100,
      }),
    }
  );
  const body = await parseGoogleResponse(res, 'searchConsole');
  return (body.rows || []) as Array<{
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}

// 3. Google Search Console API — Sitemaps List & Submit
export async function listGscSitemaps(accessToken: string, siteUrl: string) {
  const encodedSite = encodeURIComponent(siteUrl);
  const res = await fetchWithBackoff(
    `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const body = await parseGoogleResponse(res, 'searchConsole');
  return body.sitemap || [];
}

export async function submitGscSitemap(
  accessToken: string,
  siteUrl: string,
  feedpath: string
) {
  const encodedSite = encodeURIComponent(siteUrl);
  const encodedFeed = encodeURIComponent(feedpath);
  const res = await fetchWithBackoff(
    `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps/${encodedFeed}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GoogleApiError(res.status, mapGoogleApiError(res.status, body, { service: 'searchConsole' }));
  }
  return { submitted: true, feedpath };
}

// 4. Google URL Inspection API
export async function inspectGscUrl(
  accessToken: string,
  siteUrl: string,
  inspectionUrl: string
) {
  const res = await fetchWithBackoff(
    'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inspectionUrl,
        siteUrl,
        languageCode: 'en-IN',
      }),
    }
  );
  const body = await parseGoogleResponse(res, 'searchConsole');
  return body.inspectionResult;
}

// 5. Google Blogger API v3 — Blogs, Posts List, Post Status, Create & Update
export async function listBloggerBlogs(accessToken: string) {
  const res = await fetchWithBackoff(
    'https://www.googleapis.com/blogger/v3/users/self/blogs',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const body = await parseGoogleResponse(res, 'blogger');
  return (body.items || []) as Array<{
    id: string;
    name: string;
    url: string;
    posts?: { totalItems: number };
    locale?: { language: string; country: string };
  }>;
}

export async function listBloggerPosts(
  accessToken: string,
  blogId: string,
  options: { status?: 'live' | 'draft' | 'scheduled' | 'all'; maxResults?: number; pageToken?: string } = {}
) {
  const params = new URLSearchParams();
  params.set('maxResults', String(options.maxResults ?? 20));
  params.set('fetchImages', 'true');
  params.set('fetchBodies', 'false');
  if (options.status && options.status !== 'all') {
    params.append('status', options.status);
  } else {
    params.append('status', 'live');
    params.append('status', 'draft');
    params.append('status', 'scheduled');
  }
  if (options.pageToken) {
    params.set('pageToken', options.pageToken);
  }

  const res = await fetchWithBackoff(
    `https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const body = await parseGoogleResponse(res, 'blogger');
  return {
    items: (body.items || []) as Array<{
      id: string;
      title: string;
      url?: string;
      status?: string;
      published?: string;
      updated?: string;
      labels?: string[];
      images?: Array<{ url: string }>;
      author?: { displayName?: string };
    }>,
    nextPageToken: body.nextPageToken || null,
  };
}

export async function getBloggerPost(accessToken: string, blogId: string, postId: string) {
  const res = await fetchWithBackoff(
    `https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts/${encodeURIComponent(postId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return await parseGoogleResponse(res, 'blogger');
}

export async function createOrUpdateBloggerPost(
  accessToken: string,
  params: {
    blogId: string;
    existingPostId?: string | null;
    title: string;
    content: string;
    labels: string[];
    isDraft: boolean;
    publishedIso?: string;
  }
) {
  const payload: Record<string, unknown> = {
    kind: 'blogger#post',
    title: params.title,
    content: params.content,
    labels: params.labels,
  };
  if (params.publishedIso) {
    payload.published = params.publishedIso;
  }

  if (params.existingPostId) {
    // Update existing post to guarantee zero duplicate posts on retry/re-publish
    const url = `https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(
      params.blogId
    )}/posts/${encodeURIComponent(params.existingPostId)}`;
    const res = await fetchWithBackoff(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await parseGoogleResponse(res, 'blogger');
    if (!params.isDraft && body.status === 'DRAFT') {
      const pubRes = await fetchWithBackoff(`${url}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return await parseGoogleResponse(pubRes, 'blogger');
    }
    return body;
  }

  const query = params.isDraft ? '?isDraft=true' : '';
  const res = await fetchWithBackoff(
    `https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(params.blogId)}/posts${query}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
  return await parseGoogleResponse(res, 'blogger');
}

// 6. Google Analytics Data API (GA4) — Optional
export async function runGa4OrganicReport(accessToken: string, propertyId: string) {
  const cleanId = propertyId.replace(/^properties\//, '');
  const res = await fetchWithBackoff(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(cleanId)}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'screenPageViews' }],
      }),
    }
  );
  return await parseGoogleResponse(res, 'ga4');
}

// 7. Google Ads Keyword Planning API — Requires Developer Token + Customer ID
export async function fetchGoogleAdsKeywordIdeas(params: {
  accessToken: string;
  customerId: string;
  developerToken: string;
  keywords: string[];
  geoTargetConstant?: string;
  languageConstant?: string;
}) {
  const cleanCustomer = params.customerId.replace(/-/g, '');
  const res = await fetchWithBackoff(
    `https://googleads.googleapis.com/v18/customers/${encodeURIComponent(cleanCustomer)}:generateKeywordIdeas`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'developer-token': params.developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        language: params.languageConstant || 'languageConstants/1000',
        geoTargetConstants: [params.geoTargetConstant || 'geoTargetConstants/2356'],
        keywordSeed: { keywords: params.keywords },
        includeAdultKeywords: false,
      }),
    }
  );
  const body = await parseGoogleResponse(res, 'ads');
  return body.results || [];
}
