import type { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../shared/errors/index.js';
import { DEFAULT_PAGE_SIZE } from '../../shared/constants/index.js';

export class TransactionService {
  constructor(private readonly db: PrismaClient) {}

  async list(merchantId: string, page: number, pageSize: number = DEFAULT_PAGE_SIZE) {
    const where = { payment: { merchantId } };
    const [items, total] = await this.db.$transaction([
      this.db.providerTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.providerTransaction.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getById(id: string, merchantId: string) {
    const transaction = await this.db.providerTransaction.findUnique({
      where: { id },
      include: { payment: true },
    });
    if (!transaction || transaction.payment.merchantId !== merchantId) {
      throw new NotFoundError('Transaction could not be found.');
    }
    return transaction;
  }
}
