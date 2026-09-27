import { describe, expect, it } from 'vitest';
import { generateApiKey, splitApiKey, verifyApiKeySecret } from '../../src/infrastructure/security/apiKey.js';

describe('API key security', () => {
  it('generates a merchant key with the configured prefix', () => {
    const key = generateApiKey('merchant');
    expect(key.plaintext.startsWith(process.env.MERCHANT_API_KEY_PREFIX!)).toBe(true);
    expect(key.plaintext).toContain('.');
  });

  it('generates an admin key with the configured prefix', () => {
    const key = generateApiKey('admin');
    expect(key.plaintext.startsWith(process.env.ADMIN_API_KEY_PREFIX!)).toBe(true);
  });

  it('never stores the plaintext secret in the hash', () => {
    const key = generateApiKey('merchant');
    const secret = splitApiKey(key.plaintext)!.secret;
    expect(key.hashedKey).not.toContain(secret);
  });

  it('verifies a correctly generated key', () => {
    const key = generateApiKey('merchant');
    const split = splitApiKey(key.plaintext)!;
    expect(verifyApiKeySecret(split.secret, key.hashedKey)).toBe(true);
  });

  it('rejects an incorrect secret against a stored hash', () => {
    const key = generateApiKey('merchant');
    expect(verifyApiKeySecret('wrong-secret', key.hashedKey)).toBe(false);
  });

  it('rejects a malformed key with no separator', () => {
    expect(splitApiKey('not-a-valid-key-format')).toBeNull();
  });

  it('produces a different hash for two independently generated keys', () => {
    const first = generateApiKey('merchant');
    const second = generateApiKey('merchant');
    expect(first.hashedKey).not.toBe(second.hashedKey);
    expect(first.plaintext).not.toBe(second.plaintext);
  });
});
