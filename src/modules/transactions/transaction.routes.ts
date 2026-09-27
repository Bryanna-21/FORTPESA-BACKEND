import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { TransactionService } from './transaction.service.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { requireAuthentication, requireScope } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../api/response.js';
import { AuthenticationError } from '../../shared/errors/index.js';

const transactionService = new TransactionService(prisma);

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

const idParamSchema = z.object({ id: z.string().uuid() });

function requireMerchant(req: FastifyRequest): string {
  const merchantId = req.principal?.merchantId;
  if (!merchantId) throw new AuthenticationError('This endpoint requires a merchant-scoped API key.');
  return merchantId;
}

export async function registerTransactionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/transactions',
    { preHandler: [requireAuthentication, requireScope('TRANSACTIONS_READ')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const merchantId = requireMerchant(req);
      const query = listQuerySchema.parse(req.query);
      const result = await transactionService.list(merchantId, query.page, query.pageSize);
      return sendSuccess(reply, 200, req.id, result);
    },
  );

  app.get(
    '/api/v1/transactions/:id',
    { preHandler: [requireAuthentication, requireScope('TRANSACTIONS_READ')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const merchantId = requireMerchant(req);
      const { id } = idParamSchema.parse(req.params);
      const transaction = await transactionService.getById(id, merchantId);
      return sendSuccess(reply, 200, req.id, transaction);
    },
  );
}
