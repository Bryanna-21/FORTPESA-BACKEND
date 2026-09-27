import { describe, expect, it } from 'vitest';
import { computeHmacSha256Hex, verifyHmacSha256 } from '../../src/infrastructure/security/hmac.js';

describe('HMAC-SHA256 signature verification', () => {
  const secret = 'test-webhook-secret';
  const body = JSON.stringify({ event: 'payment.succeeded', data: { uuid: 'abc-123' } });

  it('accepts a correctly computed signature', () => {
    const signature = computeHmacSha256Hex(body, secret);
    expect(verifyHmacSha256(body, signature, secret)).toBe(true);
  });

  it('accepts a signature carrying a sha256= prefix', () => {
    const signature = computeHmacSha256Hex(body, secret);
    expect(verifyHmacSha256(body, `sha256=${signature}`, secret)).toBe(true);
  });

  it('accepts an uppercase-hex signature', () => {
    const signature = computeHmacSha256Hex(body, secret).toUpperCase();
    expect(verifyHmacSha256(body, signature, secret)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const signature = computeHmacSha256Hex(body, 'wrong-secret');
    expect(verifyHmacSha256(body, signature, secret)).toBe(false);
  });

  it('rejects a signature for a tampered body', () => {
    const signature = computeHmacSha256Hex(body, secret);
    const tamperedBody = JSON.stringify({ event: 'payment.succeeded', data: { uuid: 'different-id' } });
    expect(verifyHmacSha256(tamperedBody, signature, secret)).toBe(false);
  });

  it('rejects a malformed signature without throwing', () => {
    expect(verifyHmacSha256(body, 'not-a-valid-hex-signature', secret)).toBe(false);
  });

  it('rejects an empty signature', () => {
    expect(verifyHmacSha256(body, '', secret)).toBe(false);
  });
});
