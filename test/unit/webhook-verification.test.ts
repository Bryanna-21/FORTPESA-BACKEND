import { describe, expect, it } from 'vitest';
import { computeHmacSha256Hex } from '../../src/infrastructure/security/hmac.js';
import {
  parseFortpesaWebhookPayload,
  verifyFortpesaWebhookSignature,
} from '../../src/providers/fortpesa/webhook.js';
import { WebhookVerificationError } from '../../src/shared/errors/index.js';

const WEBHOOK_SECRET = process.env.FORTPESA_WEBHOOK_SECRET!;
const SIGNATURE_HEADER = 'x-fortpesa-signature';

function sign(body: string): string {
  return computeHmacSha256Hex(body, WEBHOOK_SECRET);
}

describe('fortpesa webhook verification', () => {
  const body = JSON.stringify({
    event: 'payment.succeeded',
    event_id: 'evt_1',
    data: { uuid: 'txn-uuid', status: 'success', amount: 15000 },
  });

  it('accepts a validly signed webhook', () => {
    expect(() =>
      verifyFortpesaWebhookSignature({
        rawBody: body,
        headers: { [SIGNATURE_HEADER]: sign(body) },
      }),
    ).not.toThrow();
  });

  it('rejects a webhook with no signature header at all', () => {
    expect(() =>
      verifyFortpesaWebhookSignature({ rawBody: body, headers: {} }),
    ).toThrow(WebhookVerificationError);
  });

  it('rejects a webhook with an incorrect signature', () => {
    expect(() =>
      verifyFortpesaWebhookSignature({
        rawBody: body,
        headers: { [SIGNATURE_HEADER]: 'a'.repeat(64) },
      }),
    ).toThrow(WebhookVerificationError);
  });

  it('rejects a replayed signature paired with a tampered body', () => {
    const validSignature = sign(body);
    const tamperedBody = JSON.stringify({
      event: 'payment.succeeded',
      data: { uuid: 'txn-uuid', status: 'success', amount: 999999999 },
    });

    expect(() =>
      verifyFortpesaWebhookSignature({
        rawBody: tamperedBody,
        headers: { [SIGNATURE_HEADER]: validSignature },
      }),
    ).toThrow(WebhookVerificationError);
  });

  it('parses a well-formed payload', () => {
    const parsed = parseFortpesaWebhookPayload(body);
    expect(parsed.data.uuid).toBe('txn-uuid');
  });

  it('rejects a payload that is not valid JSON', () => {
    expect(() => parseFortpesaWebhookPayload('not json')).toThrow(WebhookVerificationError);
  });

  it('rejects a payload missing the required fields', () => {
    expect(() => parseFortpesaWebhookPayload(JSON.stringify({ event: 'payment.succeeded' }))).toThrow(
      WebhookVerificationError,
    );
  });
});
