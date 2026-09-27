import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ReceiptService } from './receipt.service.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { requireAuthentication, requireScope } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../api/response.js';
import { AuthenticationError } from '../../shared/errors/index.js';

const receiptService = new ReceiptService(prisma);
const idParamSchema = z.object({ id: z.string().uuid() });

export async function registerReceiptRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/receipts/:id',
    { preHandler: [requireAuthentication, requireScope('PAYMENTS_READ')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const merchantId = req.principal?.merchantId;
      if (!merchantId)
        throw new AuthenticationError('This endpoint requires a merchant-scoped API key.');

      const { id } = idParamSchema.parse(req.params);
      const receipt = await receiptService.generate(id, merchantId);
      return sendSuccess(reply, 200, req.id, receipt);
    },
  );
}
