import type { PrismaClient, Refund } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/index.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { AuditService } from '../../infrastructure/audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../shared/constants/index.js';

/**
 * Fortpesa's public developer page confirms only the STK-push endpoint (see
 * docs/fortpesa.md) — no refund endpoint is documented anywhere Claude
 * could verify. Rather than invent one, this module tracks refund requests
 * as their own auditable record, distinct from actually moving money back:
 *
 *   REQUESTED  — recorded here, not yet sent anywhere
 *   PROCESSING — an operator has initiated it against Fortpesa manually (or
 *                via a confirmed refund API once one exists)
 *   SUCCEEDED  — confirmed complete; only now is a REFUND ledger entry
 *                written, mirroring how a payment's PAYMENT ledger entry is
 *                only written on confirmed settlement, never on initiation
 *   FAILED     — the refund did not go through
 *
 * When Fortpesa's actual refund API is confirmed, wire its call into
 * `markProcessing` below and this module's external behavior (the REST
 * surface merchants see) does not need to change.
 */
export class RefundService {
  constructor(private readonly db: PrismaClient) {}

  async requestRefund(params: {
    paymentId: string;
    merchantId: string;
    amountMinor: number;
    reason?: string;
    requestId: string;
  }): Promise<Refund> {
    const payment = await this.db.payment.findUnique({ where: { id: params.paymentId } });
    if (!payment || payment.merchantId !== params.merchantId) {
      throw new NotFoundError('Payment could not be found.');
    }

    if (payment.status !== 'SUCCEEDED') {
      throw new ConflictError('Only a succeeded payment can be refunded.', {
        currentStatus: payment.status,
      });
    }

    const existingRefunds = await this.db.refund.findMany({
      where: { paymentId: payment.id, status: { in: ['REQUESTED', 'PROCESSING', 'SUCCEEDED'] } },
    });
    const alreadyRefundedMinor = existingRefunds.reduce((sum, r) => sum + r.amountMinor, 0);

    if (alreadyRefundedMinor + params.amountMinor > payment.amountMinor) {
      throw new ValidationError('Refund amount would exceed the original payment amount.', {
        paymentAmountMinor: payment.amountMinor,
        alreadyRefundedMinor,
        requestedMinor: params.amountMinor,
      });
    }

    const refund = await this.db.$transaction(async (tx) => {
      const created = await tx.refund.create({
        data: {
          paymentId: payment.id,
          amountMinor: params.amountMinor,
          reason: params.reason,
          status: 'REQUESTED',
        },
      });

      await new AuditService(tx).record({
        action: AUDIT_ACTIONS.REFUND_CREATED,
        actorType: 'MERCHANT_API_KEY',
        paymentId: payment.id,
        requestId: params.requestId,
        metadata: { refundId: created.id, amountMinor: params.amountMinor },
      });

      return created;
    });

    return refund;
  }

  /** Admin confirms a refund has actually been completed against Fortpesa. */
  async markSucceeded(refundId: string, requestId: string): Promise<Refund> {
    const refund = await this.db.refund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });
    if (!refund) throw new NotFoundError('Refund could not be found.');
    if (refund.status === 'SUCCEEDED') return refund;
    if (refund.status === 'FAILED') {
      throw new ConflictError('Cannot mark a failed refund as succeeded.');
    }

    return this.db.$transaction(async (tx) => {
      const updated = await tx.refund.update({
        where: { id: refundId },
        data: { status: 'SUCCEEDED' },
      });

      await new LedgerService(tx).recordRefund({
        merchantId: refund.payment.merchantId,
        paymentId: refund.paymentId,
        amountMinor: refund.amountMinor,
        currency: refund.payment.currency,
        description: refund.reason ?? 'Refund confirmed',
      });

      await new AuditService(tx).record({
        action: AUDIT_ACTIONS.REFUND_CREATED,
        actorType: 'ADMIN_API_KEY',
        paymentId: refund.paymentId,
        requestId,
        metadata: { refundId: refund.id, status: 'SUCCEEDED' },
      });

      return updated;
    });
  }

  async markFailed(refundId: string, requestId: string, reason?: string): Promise<Refund> {
    const refund = await this.db.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundError('Refund could not be found.');
    if (refund.status === 'SUCCEEDED') {
      throw new ConflictError('Cannot mark a succeeded refund as failed.');
    }

    const updated = await this.db.refund.update({
      where: { id: refundId },
      data: { status: 'FAILED' },
    });

    await new AuditService(this.db).record({
      action: AUDIT_ACTIONS.REFUND_CREATED,
      actorType: 'ADMIN_API_KEY',
      paymentId: refund.paymentId,
      requestId,
      metadata: { refundId: refund.id, status: 'FAILED', reason },
    });

    return updated;
  }

  async getById(refundId: string, merchantId: string): Promise<Refund> {
    const refund = await this.db.refund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });
    if (!refund || refund.payment.merchantId !== merchantId) {
      throw new NotFoundError('Refund could not be found.');
    }
    return refund;
  }
}
