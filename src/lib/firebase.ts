import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const GOOGLE_SERVICE_SCOPES = {
  searchConsoleReadonly: 'https://www.googleapis.com/auth/webmasters.readonly',
  searchConsole: 'https://www.googleapis.com/auth/webmasters',
  blogger: 'https://www.googleapis.com/auth/blogger',
  analytics: 'https://www.googleapis.com/auth/analytics.readonly',
  ads: 'https://www.googleapis.com/auth/adwords',
} as const;

export const baseGoogleProvider = new GoogleAuthProvider();
baseGoogleProvider.setCustomParameters({ prompt: 'select_account' });

let inMemoryGoogleAccessToken: string | null = null;
let inMemoryGoogleExpiresAt = 0;
let inMemoryGoogleScopes: string[] = [];

export function getInMemoryGoogleToken() {
  if (!inMemoryGoogleAccessToken) return null;
  if (inMemoryGoogleExpiresAt && Date.now() >= inMemoryGoogleExpiresAt) {
    inMemoryGoogleAccessToken = null;
    inMemoryGoogleExpiresAt = 0;
    inMemoryGoogleScopes = [];
    return null;
  }
  return inMemoryGoogleAccessToken;
}

export function clearInMemoryGoogleToken() {
  inMemoryGoogleAccessToken = null;
  inMemoryGoogleExpiresAt = 0;
  inMemoryGoogleScopes = [];
}

/**
 * Normal Google Sign-In strictly for SEO platform authentication (openid, email, profile).
 * Does NOT assume Blogger or Search Console API permissions are granted.
 */
export async function signInAsAdmin() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken();
  return {
    user: result.user,
    idToken,
  };
}

/**
 * Separate Google API Authorization popup (used when backend GOOGLE_CLIENT_ID/SECRET offline flow
 * is not yet configured). Requests explicit service scopes and returns temporary access token.
 */
export async function authorizeGoogleApisViaPopup(requestedScopes: string[]) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
  });
  for (const scope of requestedScopes) {
    provider.addScope(scope);
  }
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    inMemoryGoogleAccessToken = credential.accessToken;
    inMemoryGoogleExpiresAt = Date.now() + 50 * 60 * 1000;
    inMemoryGoogleScopes = requestedScopes;
  }
  return {
    user: result.user,
    accessToken: credential?.accessToken || null,
    grantedScopes: inMemoryGoogleScopes,
  };
}

export async function signOutAdmin() {
  clearInMemoryGoogleToken();
  await signOut(auth);
}
