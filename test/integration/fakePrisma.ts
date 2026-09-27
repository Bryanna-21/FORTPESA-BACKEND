import { randomUUID } from 'node:crypto';

/* eslint-disable @typescript-eslint/no-explicit-any -- this fake intentionally
   mirrors Prisma's dynamic `{ where, data }` argument shapes structurally
   rather than importing generated Prisma types, so it has no dependency on
   a generated client existing in the test environment. */

/**
 * A minimal in-memory stand-in for PrismaClient covering only the methods
 * PaymentService actually calls. This lets the payment orchestration logic
 * — idempotency, state transitions, ledgering — be tested deterministically
 * and quickly, without requiring a live PostgreSQL instance in CI for every
 * unit-level check. Full database behavior (constraints, concurrency) is
 * covered separately by tests run against a real database in the
 * "integration" CI stage — see docs/troubleshooting.md.
 */
export function createFakePrisma() {
  const idempotencyKeys = new Map<string, any>();
  const payments = new Map<string, any>();
  const paymentAttempts = new Map<string, any>();
  const providerTransactions = new Map<string, any>();
  const paymentEvents: any[] = [];
  const auditLogs: any[] = [];
  const ledgerEntries: any[] = [];
  const notifications = new Map<string, any>();

  const db = {
    idempotencyKey: {
      findUnique: async ({ where }: any) => {
        const key = `${where.scope_key.scope}:${where.scope_key.key}`;
        const record = idempotencyKeys.get(key);
        if (!record) return null;
        return { ...record, payment: findPaymentByIdempotencyId(record.id) };
      },
      findUniqueOrThrow: async (args: any) => {
        const result = await db.idempotencyKey.findUnique(args);
        if (!result) throw new Error('IdempotencyKey not found');
        return result;
      },
      create: async ({ data }: any) => {
        const key = `${data.scope}:${data.key}`;
        if (idempotencyKeys.has(key)) {
          const err: any = new Error('Unique constraint violation');
          err.code = 'P2002';
          throw err;
        }
        const record = { id: randomUUID(), ...data, createdAt: new Date() };
        idempotencyKeys.set(key, record);
        return record;
      },
    },
    payment: {
      create: async ({ data }: any) => {
        const record = {
          id: randomUUID(),
          status: 'CREATED',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        payments.set(record.id, record);
        return record;
      },
      findUnique: async ({ where }: any) => payments.get(where.id) ?? null,
      findUniqueOrThrow: async ({ where }: any) => {
        const record = payments.get(where.id);
        if (!record) throw new Error('Payment not found');
        return record;
      },
      update: async ({ where, data }: any) => {
        const record = payments.get(where.id);
        const updated = { ...record, ...data, updatedAt: new Date() };
        payments.set(where.id, updated);
        return updated;
      },
      count: async ({ where }: any = {}) =>
        [...payments.values()].filter(
          (p) => !where?.merchantId || p.merchantId === where.merchantId,
        ).length,
      findMany: async () => [...payments.values()],
    },
    paymentAttempt: {
      count: async ({ where }: any) =>
        [...paymentAttempts.values()].filter((a) => a.paymentId === where.paymentId).length,
      create: async ({ data }: any) => {
        const record = { id: randomUUID(), status: 'INITIATED', createdAt: new Date(), ...data };
        paymentAttempts.set(record.id, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const record = paymentAttempts.get(where.id);
        const updated = { ...record, ...data };
        paymentAttempts.set(where.id, updated);
        return updated;
      },
    },
    providerTransaction: {
      create: async ({ data }: any) => {
        const record = { id: randomUUID(), createdAt: new Date(), ...data };
        providerTransactions.set(record.providerTransactionId, record);
        return record;
      },
      findUnique: async ({ where }: any) =>
        providerTransactions.get(where.providerTransactionId) ?? null,
    },
    paymentEvent: {
      create: async ({ data }: any) => {
        const record = { id: randomUUID(), createdAt: new Date(), ...data };
        paymentEvents.push(record);
        return record;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        const record = { id: randomUUID(), createdAt: new Date(), ...data };
        auditLogs.push(record);
        return record;
      },
    },
    ledgerEntry: {
      create: async ({ data }: any) => {
        const record = { id: randomUUID(), createdAt: new Date(), ...data };
        ledgerEntries.push(record);
        return record;
      },
    },
    notification: {
      create: async ({ data }: any) => {
        const record = { id: randomUUID(), status: 'QUEUED', createdAt: new Date(), ...data };
        notifications.set(record.id, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const record = notifications.get(where.id);
        const updated = { ...record, ...data };
        notifications.set(where.id, updated);
        return updated;
      },
    },
    $transaction: async (arg: any) => {
      if (typeof arg === 'function') {
        return arg(db);
      }
      return Promise.all(arg);
    },
    __inspect: { paymentEvents, auditLogs, ledgerEntries, payments, providerTransactions },
  };

  function findPaymentByIdempotencyId(idempotencyKeyId: string) {
    return [...payments.values()].find((p) => p.idempotencyKeyId === idempotencyKeyId) ?? null;
  }

  return db;
}
