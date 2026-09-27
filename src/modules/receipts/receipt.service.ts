import type { PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { formatMinorUnits } from '../../shared/utilities/money.js';

export interface Receipt {
  paymentId: string;
  merchantName: string;
  providerTransactionId: string | null;
  providerReference: string | null;
  amount: string;
  amountMinor: number;
  currency: string;
  reference: string;
  status: string;
  issuedAt: string;
}

export class ReceiptService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * A receipt can only be produced once authoritative confirmation exists.
   * A CREATED, PROCESSING, PENDING, FAILED, EXPIRED or CANCELLED payment
   * never yields a receipt claiming success.
   */
  async generate(paymentId: string, merchantId: string): Promise<Receipt> {
    const payment = await this.db.payment.findUnique({
      where: { id: paymentId },
      include: {
        merchant: true,
        providerTransactions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!payment || payment.merchantId !== merchantId) {
      throw new NotFoundError('Payment could not be found.');
    }

    if (payment.status !== 'SUCCEEDED') {
      throw new ConflictError('A receipt can only be issued for a succeeded payment.', {
        currentStatus: payment.status,
      });
    }

    const latestTransaction = payment.providerTransactions[0];

    return {
      paymentId: payment.id,
      merchantName: payment.merchant.name,
      providerTransactionId: latestTransaction?.providerTransactionId ?? null,
      providerReference: latestTransaction?.providerReference ?? null,
      amount: formatMinorUnits(payment.amountMinor, payment.currency),
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      reference: payment.reference,
      status: payment.status,
      issuedAt: new Date().toISOString(),
    };
  }
}
