import { ValidationError } from '../errors/index.js';

/**
 * Normalizes Kenyan mobile numbers to the canonical 2547XXXXXXXX / 2541XXXXXXXX
 * format (country code, no leading zero, no plus sign), which is the format
 * Fortpesa's STK push example accepts on the merchant-facing side after
 * their own normalization. We normalize before sending so validation
 * failures surface in our system rather than as an opaque provider error.
 *
 * Supported input formats:
 *   0712345678
 *   +254712345678
 *   254712345678
 *
 * Safaricom, Airtel and Telkom ranges are accepted; anything else is
 * rejected rather than guessed at.
 */
const VALID_PREFIXES = ['7', '1'];

export function normalizeKenyanPhoneNumber(input: string): string {
  const trimmed = input.trim().replace(/[\s-]/g, '');

  let digits: string;
  if (trimmed.startsWith('+254')) {
    digits = trimmed.slice(1);
  } else if (trimmed.startsWith('254')) {
    digits = trimmed;
  } else if (trimmed.startsWith('0')) {
    digits = `254${trimmed.slice(1)}`;
  } else {
    throw new ValidationError('Phone number must be in a recognized Kenyan format.', {
      phone: input,
    });
  }

  if (!/^254\d{9}$/.test(digits)) {
    throw new ValidationError('Phone number must resolve to 254 followed by 9 digits.', {
      phone: input,
    });
  }

  const subscriberPrefix = digits.charAt(3);
  if (!VALID_PREFIXES.includes(subscriberPrefix)) {
    throw new ValidationError('Phone number is not a recognized mobile money range.', {
      phone: input,
    });
  }

  return digits;
}
