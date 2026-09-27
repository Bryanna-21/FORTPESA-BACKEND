import type { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Ledger entries are append-only. There is deliberately no update or delete
 * method on this service — a correction is recorded as a new ADJUSTMENT
 * entry that references the original payment, never a mutation of history.
 */
export class LedgerService {
  constructor(private readonly db: DbClient) {}

  async recordPayment(params: {
    merchantId: string;
    paymentId: string;
    amountMinor: number;
    currency: string;
    description: string;
  }): Promise<void> {
    await this.db.ledgerEntry.create({
      data: {
        merchantId: params.merchantId,
        paymentId: params.paymentId,
        type: 'PAYMENT',
        amountMinor: params.amountMinor,
        currency: params.currency,
        description: params.description,
      },
    });
  }

  async recordFee(params: {
    merchantId: string;
    paymentId: string;
    amountMinor: number;
    currency: string;
    description: string;
  }): Promise<void> {
    await this.db.ledgerEntry.create({
      data: {
        merchantId: params.merchantId,
        paymentId: params.paymentId,
        type: 'FEE',
        amountMinor: params.amountMinor,
        currency: params.currency,
        description: params.description,
      },
    });
  }

  async recordRefund(params: {
    merchantId: string;
    paymentId: string;
    amountMinor: number;
    currency: string;
    description: string;
  }): Promise<void> {
    await this.db.ledgerEntry.create({
      data: {
        merchantId: params.merchantId,
        paymentId: params.paymentId,
        type: 'REFUND',
        amountMinor: -Math.abs(params.amountMinor),
        currency: params.currency,
        description: params.description,
      },
    });
  }

  async recordAdjustment(params: {
    merchantId: string;
    paymentId?: string;
    amountMinor: number;
    currency: string;
    description: string;
  }): Promise<void> {
    await this.db.ledgerEntry.create({
      data: {
        merchantId: params.merchantId,
        paymentId: params.paymentId,
        type: 'ADJUSTMENT',
        amountMinor: params.amountMinor,
        currency: params.currency,
        description: params.description,
      },
    });
  }
}
