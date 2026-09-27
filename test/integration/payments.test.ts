import { describe, expect, it } from 'vitest';
import { PaymentService } from '../../src/modules/payments/payment.service.js';
import { createFakePrisma } from './fakePrisma.js';
import { FakePaymentProvider } from './fakeProvider.js';

function buildService() {
  const db = createFakePrisma();
  const provider = new FakePaymentProvider();
  const service = new PaymentService(db as any, provider);
  return { db, provider, service };
}

const baseInput = {
  amount: 1500,
  currency: 'KES',
  phone: '0712345678',
  reference: 'ORDER-1042',
};

describe('PaymentService.createPayment — duplicate protection', () => {
  it('creates exactly one payment when the identical request is submitted five times', async () => {
    const { db, provider, service } = buildService();
    const ctx = { merchantId: 'merchant-1', idempotencyKey: 'idem-key-1', requestId: 'req-1' };

    // Submitted sequentially: this fake harness models the *outcome* the
    // database unique constraint on (scope, key) guarantees, not Postgres's
    // row-locking behavior under true concurrency (a losing INSERT blocks
    // until the winning transaction commits, then observes its result —
    // see docs/database.md). The exactly-once guarantee itself is what this
    // test asserts.
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      results.push(await service.createPayment(baseInput, ctx));
    }

    const uniquePaymentIds = new Set(results.map((p) => p.id));
    expect(uniquePaymentIds.size).toBe(1);
    expect(db.__inspect.payments.size).toBe(1);
    expect(provider.initiateCallCount).toBe(1);
  });

  it('rejects reusing the same idempotency key with a different payload', async () => {
    const { service } = buildService();
    const ctx = { merchantId: 'merchant-1', idempotencyKey: 'idem-key-2', requestId: 'req-1' };

    await service.createPayment(baseInput, ctx);

    await expect(
      service.createPayment({ ...baseInput, amount: 99999 }, ctx),
    ).rejects.toThrow(/different request payload/);
  });

  it('creates separate payments for different idempotency keys', async () => {
    const { db, service } = buildService();

    await service.createPayment(baseInput, {
      merchantId: 'merchant-1',
      idempotencyKey: 'key-a',
      requestId: 'req-1',
    });
    await service.createPayment(baseInput, {
      merchantId: 'merchant-1',
      idempotencyKey: 'key-b',
      requestId: 'req-2',
    });

    expect(db.__inspect.payments.size).toBe(2);
  });

  it('transitions a successfully initiated payment to PENDING', async () => {
    const { service } = buildService();
    const payment = await service.createPayment(baseInput, {
      merchantId: 'merchant-1',
      idempotencyKey: 'key-c',
      requestId: 'req-1',
    });

    expect(payment.status).toBe('PENDING');
  });

  it('transitions to FAILED when the provider rejects at initiation', async () => {
    const { provider, service } = buildService();
    provider.shouldFailInitiation = true;

    const payment = await service.createPayment(baseInput, {
      merchantId: 'merchant-1',
      idempotencyKey: 'key-d',
      requestId: 'req-1',
    });

    expect(payment.status).toBe('FAILED');
  });

  it('records the platform fee as a ledger entry on successful initiation', async () => {
    const { db, service } = buildService();
    await service.createPayment(baseInput, {
      merchantId: 'merchant-1',
      idempotencyKey: 'key-e',
      requestId: 'req-1',
    });

    const feeEntries = db.__inspect.ledgerEntries.filter((entry: any) => entry.type === 'FEE');
    expect(feeEntries).toHaveLength(1);
    expect(feeEntries[0].amountMinor).toBe(50);
  });
});

describe('PaymentService.applySettlement — webhook/reconciliation idempotency', () => {
  it('applies exactly one state transition and one ledger entry for five identical settlement calls', async () => {
    const { db, service } = buildService();
    const payment = await service.createPayment(baseInput, {
      merchantId: 'merchant-1',
      idempotencyKey: 'key-f',
      requestId: 'req-1',
    });
    expect(payment.status).toBe('PENDING');

    // Applied sequentially for the same reason noted in the duplicate-payment
    // test above — this asserts the idempotent *outcome*, which in
    // production is additionally guarded by each transition happening
    // inside its own serializable database transaction.
    for (let i = 0; i < 5; i += 1) {
      await service.applySettlement({
        paymentId: payment.id,
        status: 'SUCCEEDED',
        requestId: 'req-2',
        source: 'webhook',
      });
    }

    const finalPayment = db.__inspect.payments.get(payment.id);
    expect(finalPayment.status).toBe('SUCCEEDED');

    const paymentLedgerEntries = db.__inspect.ledgerEntries.filter(
      (entry: any) => entry.type === 'PAYMENT' && entry.paymentId === payment.id,
    );
    expect(paymentLedgerEntries).toHaveLength(1);
  });

  it('is a no-op when settlement is applied to an already-cancelled payment', async () => {
    const { db, service } = buildService();

    // Simulates a payment that was created but never reached the provider
    // (e.g. the process crashed between creation and initiation) and was
    // then cancelled by an operator — the only realistic path to CANCELLED,
    // since normal creation initiates with the provider synchronously.
    const orphaned = await db.payment.create({
      data: {
        merchantId: 'merchant-1',
        amountMinor: 1500,
        currency: 'KES',
        phoneNormalized: '254712345678',
        reference: 'ORDER-ORPHAN',
        status: 'CREATED',
      },
    });

    await service.cancelPayment(orphaned.id, 'merchant-1', 'req-2');

    const result = await service.applySettlement({
      paymentId: orphaned.id,
      status: 'SUCCEEDED',
      requestId: 'req-3',
      source: 'webhook',
    });

    expect(result.status).toBe('CANCELLED');
    const paymentLedgerEntries = db.__inspect.ledgerEntries.filter(
      (entry: any) => entry.type === 'PAYMENT' && entry.paymentId === orphaned.id,
    );
    expect(paymentLedgerEntries).toHaveLength(0);
  });
});

describe('PaymentService retry and cancel authorization', () => {
  it('rejects retrying a payment that does not belong to the requesting merchant', async () => {
    const { service } = buildService();
    const payment = await service.createPayment(baseInput, {
      merchantId: 'merchant-1',
      idempotencyKey: 'key-h',
      requestId: 'req-1',
    });

    await expect(service.retryPayment(payment.id, 'merchant-2', 'req-2')).rejects.toThrow(
      /could not be found/,
    );
  });

  it('rejects retrying a payment that already succeeded', async () => {
    const { service } = buildService();
    const payment = await service.createPayment(baseInput, {
      merchantId: 'merchant-1',
      idempotencyKey: 'key-i',
      requestId: 'req-1',
    });
    await service.applySettlement({
      paymentId: payment.id,
      status: 'SUCCEEDED',
      requestId: 'req-2',
      source: 'webhook',
    });

    await expect(service.retryPayment(payment.id, 'merchant-1', 'req-3')).rejects.toThrow(
      /not eligible for retry/,
    );
  });
});
