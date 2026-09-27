import type { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../shared/errors/index.js';

export class MerchantService {
  constructor(private readonly db: PrismaClient) {}

  async create(name: string): Promise<{ id: string; name: string }> {
    const merchant = await this.db.merchant.create({ data: { name } });
    return { id: merchant.id, name: merchant.name };
  }

  async getById(id: string) {
    const merchant = await this.db.merchant.findUnique({ where: { id } });
    if (!merchant) throw new NotFoundError('Merchant could not be found.');
    return merchant;
  }
}
