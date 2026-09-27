import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '../configuration/env.js';

const env = loadEnv();

const SECRET_BYTES = 32;
const SCRYPT_KEY_LENGTH = 64;

export interface GeneratedApiKey {
  /** Full key shown to the user exactly once. Never persisted in plaintext. */
  plaintext: string;
  /** Stable, non-secret prefix used to look up the key record efficiently. */
  keyPrefix: string;
  /** Salted hash safe to store. */
  hashedKey: string;
}

function hashSecret(secret: string, salt: string): string {
  const derived = scryptSync(`${secret}${env.API_KEY_PEPPER}`, salt, SCRYPT_KEY_LENGTH);
  return `${salt}:${derived.toString('hex')}`;
}

export function generateApiKey(kind: 'merchant' | 'admin'): GeneratedApiKey {
  const prefix = kind === 'admin' ? env.ADMIN_API_KEY_PREFIX : env.MERCHANT_API_KEY_PREFIX;
  const secret = randomBytes(SECRET_BYTES).toString('hex');
  const keyPrefix = `${prefix}${randomBytes(6).toString('hex')}`;
  const plaintext = `${keyPrefix}.${secret}`;
  const salt = randomBytes(16).toString('hex');
  const hashedKey = hashSecret(secret, salt);

  return { plaintext, keyPrefix, hashedKey };
}

export function splitApiKey(plaintext: string): { keyPrefix: string; secret: string } | null {
  const separatorIndex = plaintext.lastIndexOf('.');
  if (separatorIndex === -1) return null;
  return {
    keyPrefix: plaintext.slice(0, separatorIndex),
    secret: plaintext.slice(separatorIndex + 1),
  };
}

export function verifyApiKeySecret(secret: string, storedHash: string): boolean {
  const [salt, hashHex] = storedHash.split(':');
  if (!salt || !hashHex) return false;

  const candidate = scryptSync(`${secret}${env.API_KEY_PEPPER}`, salt, SCRYPT_KEY_LENGTH);
  const stored = Buffer.from(hashHex, 'hex');

  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
