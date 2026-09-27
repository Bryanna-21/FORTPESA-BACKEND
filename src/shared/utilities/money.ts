import { ValidationError } from '../errors/index.js';

/**
 * All monetary values in this system are represented as integer minor units
 * (e.g. cents). Floating-point arithmetic is never used for money — every
 * addition, comparison and conversion goes through this module so a single
 * audited implementation backs every financial calculation in the codebase.
 */

const SUPPORTED_CURRENCIES = new Set(['KES']);

export function assertSupportedCurrency(currency: string): void {
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    throw new ValidationError(`Unsupported currency: ${currency}`, { currency });
  }
}

export function assertValidAmountMinorUnits(
  amountMinor: number,
  bounds: { min: number; max: number },
): void {
  if (!Number.isInteger(amountMinor)) {
    throw new ValidationError('Amount must be an integer number of minor units.', {
      amountMinor,
    });
  }
  if (amountMinor <= 0) {
    throw new ValidationError('Amount must be greater than zero.', { amountMinor });
  }
  if (amountMinor < bounds.min) {
    throw new ValidationError('Amount is below the minimum allowed transaction amount.', {
      amountMinor,
      minimum: bounds.min,
    });
  }
  if (amountMinor > bounds.max) {
    throw new ValidationError('Amount exceeds the maximum allowed transaction amount.', {
      amountMinor,
      maximum: bounds.max,
    });
  }
}

export function addMinorUnits(...values: number[]): number {
  return values.reduce((total, value) => {
    if (!Number.isInteger(value)) {
      throw new ValidationError('Cannot sum non-integer monetary values.', { value });
    }
    return total + value;
  }, 0);
}

export function formatMinorUnits(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(major);
}

export function majorToMinorUnits(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}
