import { NextFunction, Request, Response } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateAdminUser } from '../db/users.ts';
import { runWithDbAuth } from '../db/index.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  adminEmail?: string;
}

export const requireAdminAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing administrator Bearer token.' });
  }

  const token = authHeader.split('Bearer ')[1];
  let decodedToken: DecodedIdToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(token);
  } catch (error: any) {
    const msg = String(error?.message || '');
    if (msg.includes('incorrect "aud"') || msg.includes('incorrect "iss"')) {
      console.warn('Rejected stale Firebase ID token from previous project; client will refresh.');
      return res.status(401).json({
        error: 'Session belongs to a previous Firebase project. Refreshing administrator sign-in...',
        code: 'PROJECT_MISMATCH',
      });
    }
    console.warn('Firebase ID token verification failed:', error?.code || msg);
    return res.status(401).json({
      error: 'Unauthorized: Invalid or expired session token.',
      code: typeof error?.code === 'string' ? error.code : 'INVALID_SESSION_TOKEN',
    });
  }

  if (!decodedToken.email) {
    return res.status(403).json({ error: 'Forbidden: Google account email is required.' });
  }

  return runWithDbAuth({ uid: decodedToken.uid, idToken: token }, async () => {
    try {
      await getOrCreateAdminUser(
        decodedToken.uid,
        decodedToken.email!,
        decodedToken.name,
        decodedToken.picture
      );
    } catch (error: any) {
      if (error?.message?.startsWith('ACCESS_DENIED:')) {
        return res.status(403).json({
          error: 'Access denied: Only the single authorized TreeWalley administrator can sign in.',
        });
      }
      console.error('Administrator database verification failed:', error?.message || error);
      return res.status(503).json({
        error: 'Administrator workspace storage is temporarily unavailable. Please try again shortly.',
        code: 'DATABASE_UNAVAILABLE',
      });
    }

    req.user = decodedToken;
    req.adminEmail = decodedToken.email!.toLowerCase();
    next();
  });
};
