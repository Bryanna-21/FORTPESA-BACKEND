import { describe, expect, it } from 'vitest';
import { normalizeKenyanPhoneNumber } from '../../src/shared/utilities/phone.js';
import { ValidationError } from '../../src/shared/errors/index.js';

describe('normalizeKenyanPhoneNumber', () => {
  it('normalizes a local-format number', () => {
    expect(normalizeKenyanPhoneNumber('0712345678')).toBe('254712345678');
  });

  it('normalizes a plus-prefixed international number', () => {
    expect(normalizeKenyanPhoneNumber('+254712345678')).toBe('254712345678');
  });

  it('normalizes an unprefixed international number', () => {
    expect(normalizeKenyanPhoneNumber('254712345678')).toBe('254712345678');
  });

  it('accepts Airtel-range numbers (1xx)', () => {
    expect(normalizeKenyanPhoneNumber('0112345678')).toBe('254112345678');
  });

  it('strips spaces and dashes before normalizing', () => {
    expect(normalizeKenyanPhoneNumber('0712 345 678')).toBe('254712345678');
    expect(normalizeKenyanPhoneNumber('0712-345-678')).toBe('254712345678');
  });

  it('rejects numbers with the wrong digit count', () => {
    expect(() => normalizeKenyanPhoneNumber('07123456')).toThrow(ValidationError);
    expect(() => normalizeKenyanPhoneNumber('071234567890')).toThrow(ValidationError);
  });

  it('rejects unrecognized formats', () => {
    expect(() => normalizeKenyanPhoneNumber('not-a-phone')).toThrow(ValidationError);
    expect(() => normalizeKenyanPhoneNumber('+15551234567')).toThrow(ValidationError);
  });

  it('rejects numbers outside known mobile money ranges', () => {
    expect(() => normalizeKenyanPhoneNumber('0212345678')).toThrow(ValidationError);
  });
});
