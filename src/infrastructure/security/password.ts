import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEY_LENGTH = 64;

/**
 * Same scrypt-based approach as API key hashing (src/infrastructure/security/apiKey.ts),
 * applied to human account passwords. Kept as a separate module because
 * passwords and API keys have different lifecycle rules (password reset,
 * complexity checks) even though the underlying primitive is shared.
 */
export function hashPassword(plaintext: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plaintext, salt, SCRYPT_KEY_LENGTH);
  return `${salt}:${derived.toString('hex')}`;
}

export function verifyPassword(plaintext: string, storedHash: string): boolean {
  const [salt, hashHex] = storedHash.split(':');
  if (!salt || !hashHex) return false;

  const candidate = scryptSync(plaintext, salt, SCRYPT_KEY_LENGTH);
  const stored = Buffer.from(hashHex, 'hex');

  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
