import { createHash } from 'node:crypto';
import type { Payment, Prisma, PrismaClient } from '@prisma/client';
import type { PaymentProvider } from '../../providers/PaymentProvider.js';
import { assertLegalTransition, isRetryable, isTerminal } from './payment.state-machine.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { AuditService } from '../../infrastructure/audit/audit.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { normalizeKenyanPhoneNumber } from '../../shared/utilities/phone.js';
import {
  assertSupportedCurrency,
  assertValidAmountMinorUnits,
} from '../../shared/utilities/money.js';
import {
  ConflictError,
  NotFoundError,
  ProviderError,
  ValidationError,
} from '../../shared/errors/index.js';
import { IDEMPOTENCY_SCOPE_PAYMENT_CREATE, AUDIT_ACTIONS } from '../../shared/constants/index.js';
import type { CreatePaymentInput, ListPaymentsQuery } from './payment.schemas.js';
import type { PaymentStatus } from '../../shared/types/index.js';
import { loadEnv } from '../../infrastructure/configuration/env.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { isUniqueConstraintViolation } from '../../infrastructure/database/prismaErrors.js';

const log = logger.child({ module: 'payments.service' });

export interface CreatePaymentContext {
  merchantId: string;
  idempotencyKey: string;
  requestId: string;
}

function hashRequestBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export class PaymentService {
  constructor(
    private readonly db: PrismaClient,
    private readonly provider: PaymentProvider,
  ) {}

  async createPayment(input: CreatePaymentInput, ctx: CreatePaymentContext): Promise<Payment> {
    const env = loadEnv();

    // 1. Validate everything the client is not authorized to simply assert.
    const currency = input.currency;
    assertSupportedCurrency(currency);
    assertValidAmountMinorUnits(input.amount, {
      min: env.MIN_PAYMENT_AMOUNT_MINOR_UNITS,
      max: env.MAX_PAYMENT_AMOUNT_MINOR_UNITS,
    });
    const phoneNormalized = normalizeKenyanPhoneNumber(input.phone);

    const requestHash = hashRequestBody({ ...input, merchantId: ctx.merchantId });

    // 2. Idempotency: the same key with the same payload returns the
    // existing payment; the same key with a different payload is rejected.
    const existingKey = await this.db.idempotencyKey.findUnique({
      where: {
        scope_key: { scope: IDEMPOTENCY_SCOPE_PAYMENT_CREATE, key: ctx.idempotencyKey },
      },
      include: { payment: true },
    });

    if (existingKey) {
      if (existingKey.requestHash !== requestHash) {
        throw new ConflictError(
          'This idempotency key was already used with a different request payload.',
        );
      }
      if (!existingKey.payment) {
        throw new ConflictError('Payment creation for this idempotency key is still in progress.');
      }
      return existingKey.payment;
    }

    const expiresAt = new Date(Date.now() + env.PAYMENT_EXPIRY_MINUTES * 60_000);

    let payment: Payment;
    try {
      payment = await this.db.$transaction(async (tx) => {
        const idempotencyRecord = await tx.idempotencyKey.create({
          data: {
            scope: IDEMPOTENCY_SCOPE_PAYMENT_CREATE,
            key: ctx.idempotencyKey,
            requestHash,
          },
        });

        const created = await tx.payment.create({
          data: {
            merchantId: ctx.merchantId,
            idempotencyKeyId: idempotencyRecord.id,
            amountMinor: input.amount,
            currency,
            phoneNormalized,
            reference: input.reference,
            description: input.description,
            status: 'CREATED',
            expiresAt,
          },
        });

        await new AuditService(tx).record({
          action: AUDIT_ACTIONS.PAYMENT_CREATED,
          actorType: 'MERCHANT_API_KEY',
          paymentId: created.id,
          requestId: ctx.requestId,
          metadata: { amountMinor: input.amount, reference: input.reference },
        });

        await tx.paymentEvent.create({
          data: {
            paymentId: created.id,
            type: 'PAYMENT_CREATED',
            toStatus: 'CREATED',
          },
        });

        return created;
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        // Lost the race to a concurrent identical request; return its result.
        const winning = await this.db.idempotencyKey.findUniqueOrThrow({
          where: {
            scope_key: { scope: IDEMPOTENCY_SCOPE_PAYMENT_CREATE, key: ctx.idempotencyKey },
          },
          include: { payment: true },
        });
        if (!winning.payment) {
          throw new ConflictError(
            'Payment creation for this idempotency key is still in progress.',
          );
        }
        return winning.payment;
      }
      throw err;
    }

    return this.initiateWithProvider(payment, ctx.requestId);
  }

  private async initiateWithProvider(payment: Payment, requestId: string): Promise<Payment> {
    await this.transition(payment.id, 'PROCESSING', requestId, AUDIT_ACTIONS.PAYMENT_PROCESSING);

    const nextAttemptNo =
      (await this.db.paymentAttempt.count({ where: { paymentId: payment.id } })) + 1;
    const attempt = await this.db.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        attemptNo: nextAttemptNo,
        status: 'INITIATED',
      },
    });

    try {
      const result = await this.provider.initiatePayment({
        paymentId: payment.id,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        phoneNormalized: payment.phoneNormalized,
        accountReference: payment.reference,
        description: payment.description ?? undefined,
      });

      await this.db.$transaction(async (tx) => {
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: result.status === 'PENDING' ? 'PENDING' : 'FAILED',
            providerRequestPayload: {
              amountMinor: payment.amountMinor,
              phoneNormalized: payment.phoneNormalized,
              reference: payment.reference,
            } as Prisma.InputJsonValue,
            providerResponsePayload: result.raw as Prisma.InputJsonValue,
          },
        });

        await tx.providerTransaction.create({
          data: {
            paymentId: payment.id,
            paymentAttemptId: attempt.id,
            providerName: this.provider.name,
            providerTransactionId: result.providerTransactionId,
            providerReference: result.providerReference,
            rawStatus: result.rawStatus,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            metadata: (result.raw ?? {}) as Prisma.InputJsonValue,
          },
        });

        if (result.platformFeeMinor && result.platformFeeMinor > 0) {
          await new LedgerService(tx).recordFee({
            merchantId: payment.merchantId,
            paymentId: payment.id,
            amountMinor: result.platformFeeMinor,
            currency: payment.currency,
            description: 'Fortpesa platform fee on payment initiation',
          });
        }
      });

      if (result.status === 'FAILED') {
        return this.transition(payment.id, 'FAILED', requestId, AUDIT_ACTIONS.PAYMENT_FAILED, {
          reason: 'Provider rejected the request at initiation',
        });
      }

      return this.transition(payment.id, 'PENDING', requestId, AUDIT_ACTIONS.PAYMENT_PENDING);
    } catch (err) {
      await this.db.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          failureReason: err instanceof Error ? err.message : 'Unknown provider error',
        },
      });

      log.error({ err, paymentId: payment.id }, 'Provider initiation failed');

      if (err instanceof ProviderError) {
        return this.transition(payment.id, 'FAILED', requestId, AUDIT_ACTIONS.PAYMENT_FAILED, {
          reason: err.message,
          retryable: err.retryable,
        });
      }
      throw err;
    }
  }

  async retryPayment(paymentId: string, merchantId: string, requestId: string): Promise<Payment> {
    const env = loadEnv();
    const payment = await this.getOwnedPayment(paymentId, merchantId);

    if (!isRetryable(payment.status as PaymentStatus)) {
      throw new ConflictError(`Payment in status ${payment.status} is not eligible for retry.`);
    }

    const attemptCount = await this.db.paymentAttempt.count({ where: { paymentId } });
    if (attemptCount >= env.MAX_PAYMENT_RETRY_ATTEMPTS) {
      throw new ConflictError('Maximum retry attempts exceeded for this payment.');
    }

    return this.initiateWithProvider(payment, requestId);
  }

  async cancelPayment(paymentId: string, merchantId: string, requestId: string): Promise<Payment> {
    const payment = await this.getOwnedPayment(paymentId, merchantId);
    return this.transition(payment.id, 'CANCELLED', requestId, AUDIT_ACTIONS.PAYMENT_CANCELLED);
  }

  async getOwnedPayment(paymentId: string, merchantId: string): Promise<Payment> {
    const payment = await this.db.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.merchantId !== merchantId) {
      throw new NotFoundError('Payment could not be found.');
    }
    return payment;
  }

  async listPayments(merchantId: string, query: ListPaymentsQuery) {
    const where: Prisma.PaymentWhereInput = { merchantId };
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const [items, total] = await this.db.$transaction([
      this.db.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.payment.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Applies a settlement outcome (SUCCEEDED/FAILED/EXPIRED) coming either
   * from a verified webhook or from reconciliation's own provider status
   * lookup. Idempotent: if the payment is already terminal, this is a no-op
   * rather than an error, so replayed webhooks and repeated reconciliation
   * passes are always safe.
   */
  async applySettlement(params: {
    paymentId: string;
    status: 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
    requestId: string;
    source: 'webhook' | 'reconciliation';
    metadata?: Record<string, unknown>;
  }): Promise<Payment> {
    const payment = await this.db.payment.findUnique({ where: { id: params.paymentId } });
    if (!payment) {
      throw new NotFoundError('Payment could not be found for settlement.');
    }

    if (isTerminal(payment.status as PaymentStatus)) {
      log.info(
        { paymentId: payment.id, status: payment.status, source: params.source },
        'Ignoring settlement for an already-terminal payment',
      );
      return payment;
    }

    if (payment.status !== 'PENDING') {
      log.warn(
        { paymentId: payment.id, status: payment.status, source: params.source },
        'Received settlement for a payment that is not yet PENDING; applying cautiously',
      );
    }

    const auditAction =
      params.status === 'SUCCEEDED'
        ? AUDIT_ACTIONS.PAYMENT_SUCCEEDED
        : params.status === 'FAILED'
          ? AUDIT_ACTIONS.PAYMENT_FAILED
          : AUDIT_ACTIONS.PAYMENT_EXPIRED;

    const updated = await this.transition(
      payment.id,
      params.status,
      params.requestId,
      auditAction,
      {
        source: params.source,
        ...params.metadata,
      },
    );

    if (params.status === 'SUCCEEDED') {
      await new LedgerService(this.db).recordPayment({
        merchantId: payment.merchantId,
        paymentId: payment.id,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        description: `Payment settled via ${params.source}`,
      });
    }

    await new NotificationService(this.db).notify({
      merchantId: payment.merchantId,
      paymentId: payment.id,
      event: `payment.${params.status.toLowerCase()}`,
      data: { paymentId: payment.id, status: params.status },
    });

    return updated;
  }

  private async transition(
    paymentId: string,
    to: Payment['status'],
    requestId: string,
    auditAction: string,
    metadata?: Record<string, unknown>,
  ): Promise<Payment> {
    return this.db.$transaction(async (tx) => {
      const current = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      assertLegalTransition(current.status as PaymentStatus, to as PaymentStatus);

      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: { status: to },
      });

      await tx.paymentEvent.create({
        data: {
          paymentId,
          type: auditAction,
          fromStatus: current.status,
          toStatus: to,
          metadata: metadata as Prisma.InputJsonValue | undefined,
        },
      });

      await new AuditService(tx).record({
        action: auditAction,
        actorType: 'SYSTEM',
        paymentId,
        requestId,
        metadata,
      });

      return updated;
    });
  }
}

export function assertPaymentBelongsToMerchant(
  payment: Payment | null,
  merchantId: string,
): Payment {
  if (!payment || payment.merchantId !== merchantId) {
    throw new ValidationError('Payment does not belong to the authenticated merchant.');
  }
  return payment;
}
