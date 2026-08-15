import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'verifai-secret-key-change-in-production-2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const COOKIE_NAME = 'verifai_admin_session';

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export async function createSessionToken(username: string): Promise<string> {
  const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
  const payload = JSON.stringify({
    sub: username,
    role: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
  });

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const key = await getHmacKey(JWT_SECRET);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dataToSign));
  const encodedSignature = base64UrlEncode(Buffer.from(signature).toString('utf-8'));

  return `${dataToSign}.${encodedSignature}`;
}

export async function verifySessionToken(token: string): Promise<{ valid: boolean; username?: string }> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false };

    const [encodedHeader, encodedPayload, signaturePart] = parts;
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const key = await getHmacKey(JWT_SECRET);
    const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dataToSign));
    const expectedSigBase64 = base64UrlEncode(Buffer.from(expectedSig).toString('utf-8'));

    if (signaturePart !== expectedSigBase64) {
      return { valid: false };
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false };
    }

    return { valid: true, username: payload.sub };
  } catch {
    return { valid: false };
  }
}

export function validateAdminCredentials(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

export { COOKIE_NAME };
