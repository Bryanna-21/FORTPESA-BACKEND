import { describe, expect, it } from 'vitest';
import {
  addMinorUnits,
  assertSupportedCurrency,
  assertValidAmountMinorUnits,
  formatMinorUnits,
  majorToMinorUnits,
} from '../../src/shared/utilities/money.js';
import { ValidationError } from '../../src/shared/errors/index.js';

describe('money utilities', () => {
  it('accepts a valid integer amount within bounds', () => {
    expect(() => assertValidAmountMinorUnits(1500, { min: 100, max: 100000 })).not.toThrow();
  });

  it('rejects non-integer amounts', () => {
    expect(() => assertValidAmountMinorUnits(15.5, { min: 100, max: 100000 })).toThrow(ValidationError);
  });

  it('rejects zero and negative amounts', () => {
    expect(() => assertValidAmountMinorUnits(0, { min: 100, max: 100000 })).toThrow(ValidationError);
    expect(() => assertValidAmountMinorUnits(-500, { min: 100, max: 100000 })).toThrow(ValidationError);
  });

  it('rejects amounts below the minimum', () => {
    expect(() => assertValidAmountMinorUnits(50, { min: 100, max: 100000 })).toThrow(ValidationError);
  });

  it('rejects amounts above the maximum', () => {
    expect(() => assertValidAmountMinorUnits(200000, { min: 100, max: 100000 })).toThrow(ValidationError);
  });

  it('rejects unsupported currencies', () => {
    expect(() => assertSupportedCurrency('USD')).toThrow(ValidationError);
    expect(() => assertSupportedCurrency('KES')).not.toThrow();
  });

  it('sums minor units exactly without floating point drift', () => {
    expect(addMinorUnits(100, 200, 1)).toBe(301);
  });

  it('rejects summing non-integer values', () => {
    expect(() => addMinorUnits(100, 1.5)).toThrow(ValidationError);
  });

  it('converts major units to minor units', () => {
    expect(majorToMinorUnits(150.5)).toBe(15050);
  });

  it('formats minor units as a currency string', () => {
    expect(formatMinorUnits(150000, 'KES')).toContain('1,500.00');
  });
});
