import { describe, expect, it } from 'vitest';
import { fromStkResponse, fromWebhookPayload, toStkRequest } from '../../src/providers/fortpesa/mapper.js';
import { FortpesaApiError } from '../../src/providers/fortpesa/errors.js';

describe('fortpesa mapper', () => {
  it('builds an STK request matching the confirmed public API shape', () => {
    const request = toStkRequest({
      paymentId: 'pay_1',
      amountMinor: 15000,
      currency: 'KES',
      phoneNormalized: '254712345678',
      accountReference: 'INV-2041',
    });

    expect(request).toEqual({
      amount: 15000,
      phone: '0712345678',
      account_reference: 'INV-2041',
    });
  });

  it('includes description only when provided', () => {
    const request = toStkRequest({
      paymentId: 'pay_1',
      amountMinor: 15000,
      currency: 'KES',
      phoneNormalized: '254712345678',
      accountReference: 'INV-2041',
      description: 'Order payment',
    });

    expect(request.description).toBe('Order payment');
  });

  it('maps a pending STK response to a PENDING provider result', () => {
    const result = fromStkResponse({
      data: { uuid: 'txn-uuid', status: 'pending', platform_fee: 600 },
    });

    expect(result).toMatchObject({
      providerTransactionId: 'txn-uuid',
      status: 'PENDING',
      rawStatus: 'pending',
      platformFeeMinor: 600,
    });
  });

  it('maps an unrecognized STK status to FAILED rather than assuming success', () => {
    const result = fromStkResponse({
      data: { uuid: 'txn-uuid', status: 'rejected', platform_fee: 0 },
    });

    expect(result.status).toBe('FAILED');
  });

  it('maps a succeeded webhook event', () => {
    const event = fromWebhookPayload({
      event: 'payment.succeeded',
      event_id: 'evt_1',
      data: { uuid: 'txn-uuid', status: 'success', amount: 15000, currency: 'KES' },
    });

    expect(event).toMatchObject({
      providerTransactionId: 'txn-uuid',
      status: 'SUCCEEDED',
      amountMinor: 15000,
      currency: 'KES',
    });
  });

  it('maps a failed webhook event', () => {
    const event = fromWebhookPayload({
      event: 'payment.failed',
      data: { uuid: 'txn-uuid', status: 'failed', amount: 15000 },
    });

    expect(event.status).toBe('FAILED');
  });

  it('maps an expired webhook event', () => {
    const event = fromWebhookPayload({
      event: 'payment.expired',
      data: { uuid: 'txn-uuid', status: 'expired', amount: 15000 },
    });

    expect(event.status).toBe('EXPIRED');
  });

  it('defaults currency to KES when the provider omits it', () => {
    const event = fromWebhookPayload({
      event: 'payment.succeeded',
      data: { uuid: 'txn-uuid', status: 'success', amount: 15000 },
    });

    expect(event.currency).toBe('KES');
  });

  it('throws rather than guessing at an unrecognized event type', () => {
    expect(() =>
      fromWebhookPayload({
        // @ts-expect-error intentionally invalid for this test
        event: 'payment.unknown',
        data: { uuid: 'txn-uuid', status: 'unknown', amount: 15000 },
      }),
    ).toThrow(FortpesaApiError);
  });
});
