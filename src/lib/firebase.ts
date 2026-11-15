import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const ACTIVE_OAUTH_CLIENT_ID = firebaseConfig.oAuthClientId;
export const ACTIVE_PROJECT_ID = firebaseConfig.projectId;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(firestore, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export const GOOGLE_SERVICE_SCOPES = {
  searchConsoleReadonly: 'https://www.googleapis.com/auth/webmasters.readonly',
  searchConsole: 'https://www.googleapis.com/auth/webmasters',
  blogger: 'https://www.googleapis.com/auth/blogger',
  analytics: 'https://www.googleapis.com/auth/analytics.readonly',
  ads: 'https://www.googleapis.com/auth/adwords',
} as const;

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
 * Uses the active project OAuth client ID from firebase-applet-config.json.
 */
export async function signInAsAdmin() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken(true);
  return {
    user: result.user,
    idToken,
  };
}

/**
 * Separate Google API Authorization popup powered by the active Developer OAuth Client ID
 * (531048520662-cjfc2kbg9ukioh76kbb18dvi9pr76v0e.apps.googleusercontent.com).
 * Requests explicit service scopes and caches the verified token in memory only.
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
