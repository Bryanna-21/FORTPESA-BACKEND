import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { RefundService } from './refund.service.js';
import { createRefundSchema } from './refund.schemas.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { requireAdmin, requireAuthentication, requireScope } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../api/response.js';
import { AuthenticationError } from '../../shared/errors/index.js';

const refundService = new RefundService(prisma);
const paymentIdParamSchema = z.object({ id: z.string().uuid() });
const refundIdParamSchema = z.object({ id: z.string().uuid() });
const failRefundSchema = z.object({ reason: z.string().max(255).optional() });

function requireMerchant(req: FastifyRequest): string {
  const merchantId = req.principal?.merchantId;
  if (!merchantId)
    throw new AuthenticationError('This endpoint requires a merchant-scoped API key.');
  return merchantId;
}

export async function registerRefundRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/payments/:id/refunds',
    { preHandler: [requireAuthentication, requireScope('REFUNDS_WRITE')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const merchantId = requireMerchant(req);
      const { id } = paymentIdParamSchema.parse(req.params);
      const input = createRefundSchema.parse(req.body);

      const refund = await refundService.requestRefund({
        paymentId: id,
        merchantId,
        amountMinor: input.amount,
        reason: input.reason,
        requestId: req.id,
      });

      return sendSuccess(reply, 201, req.id, refund);
    },
  );

  app.get(
    '/api/v1/refunds/:id',
    { preHandler: [requireAuthentication, requireScope('PAYMENTS_READ')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const merchantId = requireMerchant(req);
      const { id } = refundIdParamSchema.parse(req.params);
      const refund = await refundService.getById(id, merchantId);
      return sendSuccess(reply, 200, req.id, refund);
    },
  );

  app.post(
    '/api/v1/admin/refunds/:id/succeed',
    { preHandler: [requireAuthentication, requireAdmin] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = refundIdParamSchema.parse(req.params);
      const refund = await refundService.markSucceeded(id, req.id);
      return sendSuccess(reply, 200, req.id, refund);
    },
  );

  app.post(
    '/api/v1/admin/refunds/:id/fail',
    { preHandler: [requireAuthentication, requireAdmin] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = refundIdParamSchema.parse(req.params);
      const input = failRefundSchema.parse(req.body ?? {});
      const refund = await refundService.markFailed(id, req.id, input.reason);
      return sendSuccess(reply, 200, req.id, refund);
    },
  );
}
