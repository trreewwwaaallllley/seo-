import crypto from 'crypto';

function getEncryptionKey(): Buffer {
  const seed =
    process.env.TOKEN_ENCRYPTION_SECRET ||
    process.env.SQL_PASSWORD ||
    process.env.GEMINI_API_KEY ||
    'treewalley-seo-command-center-fallback-key';
  return crypto.createHash('sha256').update(seed).digest();
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const parts = payload.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export interface SignedOAuthStatePayload {
  uid: string;
  email: string;
  services: string[];
  nonce: string;
  ts: number;
}

export function signOAuthState(payload: SignedOAuthStatePayload): string {
  const key = getEncryptionKey();
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(stateToken: string, maxAgeMs = 10 * 60 * 1000): SignedOAuthStatePayload | null {
  if (!stateToken || !stateToken.includes('.')) return null;
  try {
    const [encoded, sig] = stateToken.split('.');
    const key = getEncryptionKey();
    const expectedSig = crypto.createHmac('sha256', key).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedOAuthStatePayload;
    if (!parsed?.uid || !parsed?.ts || Date.now() - parsed.ts > maxAgeMs) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

