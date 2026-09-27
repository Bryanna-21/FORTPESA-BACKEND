import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuthenticationError } from '../../shared/errors/index.js';
import { loadEnv } from '../configuration/env.js';

/**
 * A deliberately minimal signed session token: base64url(payload) + "." +
 * HMAC-SHA256(payload). This is not a JWT and makes no claim to be — no
 * algorithm negotiation, no header, nothing an attacker can use to force a
 * downgrade to "alg: none". It carries exactly the two claims this platform
 * needs (user id, expiry) and is verified with a single constant-time HMAC
 * check. If richer claims or interoperability with other services becomes
 * necessary, replace this with a standard JWT library rather than growing
 * this format ad hoc.
 */
export interface SessionTokenPayload {
  userId: string;
  merchantId: string | null;
  role: 'ADMIN' | 'MERCHANT_OWNER' | 'MERCHANT_STAFF';
  expiresAt: number;
}

function getSessionSecret(): string {
  return loadEnv().SESSION_SECRET;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function issueSessionToken(payload: SessionTokenPayload): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SessionTokenPayload {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    throw new AuthenticationError('Malformed session token.');
  }

  const expectedSignature = createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');

  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new AuthenticationError('Invalid session token.');
  }

  let payload: SessionTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionTokenPayload;
  } catch {
    throw new AuthenticationError('Malformed session token.');
  }

  if (Date.now() > payload.expiresAt) {
    throw new AuthenticationError('Session token has expired.');
  }

  return payload;
}
