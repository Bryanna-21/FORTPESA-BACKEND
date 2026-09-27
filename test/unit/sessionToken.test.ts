import { describe, expect, it, vi } from 'vitest';
import {
  issueSessionToken,
  verifySessionToken,
} from '../../src/infrastructure/security/sessionToken.js';
import { AuthenticationError } from '../../src/shared/errors/index.js';

const basePayload = {
  userId: 'user-1',
  merchantId: 'merchant-1',
  role: 'MERCHANT_OWNER' as const,
};

describe('session token', () => {
  it('issues a token that verifies back to the original payload', () => {
    const expiresAt = Date.now() + 60_000;
    const token = issueSessionToken({ ...basePayload, expiresAt });
    const verified = verifySessionToken(token);

    expect(verified).toEqual({ ...basePayload, expiresAt });
  });

  it('rejects a token with a tampered payload', () => {
    const token = issueSessionToken({ ...basePayload, expiresAt: Date.now() + 60_000 });
    const [payload, signature] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...basePayload, role: 'ADMIN', expiresAt: Date.now() + 60_000 }),
    ).toString('base64url');

    expect(() => verifySessionToken(`${tamperedPayload}.${signature}`)).toThrow(
      AuthenticationError,
    );
    void payload;
  });

  it('rejects a malformed token with no signature segment', () => {
    expect(() => verifySessionToken('not-a-valid-token')).toThrow(AuthenticationError);
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    try {
      const token = issueSessionToken({ ...basePayload, expiresAt: Date.now() + 1000 });
      vi.advanceTimersByTime(2000);
      expect(() => verifySessionToken(token)).toThrow(AuthenticationError);
    } finally {
      vi.useRealTimers();
    }
  });
});
