import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/infrastructure/security/password.js';

describe('password hashing', () => {
  it('verifies a correct password against its own hash', () => {
    const hash = hashPassword('a-reasonably-strong-password');
    expect(verifyPassword('a-reasonably-strong-password', hash)).toBe(true);
  });

  it('rejects an incorrect password', () => {
    const hash = hashPassword('a-reasonably-strong-password');
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('never stores the plaintext password in the hash', () => {
    const password = 'a-reasonably-strong-password';
    const hash = hashPassword(password);
    expect(hash).not.toContain(password);
  });

  it('produces different hashes for the same password (unique salts)', () => {
    const first = hashPassword('same-password');
    const second = hashPassword('same-password');
    expect(first).not.toBe(second);
  });

  it('rejects a malformed stored hash gracefully', () => {
    expect(verifyPassword('anything', 'not-a-valid-hash')).toBe(false);
  });
});
