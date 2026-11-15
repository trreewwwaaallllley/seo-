import { auth, getInMemoryGoogleToken } from './firebase';

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Administrator session required. Please sign in.');
  }

  const idToken = await user.getIdToken();
  const googleToken = getInMemoryGoogleToken();

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${idToken}`);
  if (googleToken) {
    headers.set('x-google-access-token', googleToken);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  let data: any;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const rawText = await response.text();
    const cleanText = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    data = { error: cleanText || `Request failed (${response.status})` };
  }

  if (!response.ok) {
    const err = new Error(data?.error || `Request failed (${response.status})`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = response.status;
    if (typeof data?.code === 'string') {
      err.code = data.code;
    }
    throw err;
  }

  return data as T;
}
