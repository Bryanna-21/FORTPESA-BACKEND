import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies an HMAC-SHA256 signature over a raw request body using a
 * constant-time comparison so signature checks cannot be timed to leak
 * information about the expected value.
 *
 * The signature is expected to be a lowercase hex digest. If the provider
 * later documents a different encoding (e.g. base64) or a prefixed scheme
 * (e.g. "sha256=<digest>"), update `normalizeSignature` — this is the single
 * point of adjustment.
 */
export function computeHmacSha256Hex(rawBody: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function normalizeSignature(signature: string): string {
  const prefixed = signature.trim();
  const withoutPrefix = prefixed.startsWith('sha256=')
    ? prefixed.slice('sha256='.length)
    : prefixed;
  return withoutPrefix.toLowerCase();
}

export function verifyHmacSha256(
  rawBody: string | Buffer,
  providedSignature: string,
  secret: string,
): boolean {
  const expected = computeHmacSha256Hex(rawBody, secret);
  const provided = normalizeSignature(providedSignature);

  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(provided, 'hex');

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
