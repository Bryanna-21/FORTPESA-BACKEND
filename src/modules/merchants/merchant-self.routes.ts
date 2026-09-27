import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiKeyService } from '../auth/apiKey.service.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { requireUserSession } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../api/response.js';
import { AuditService } from '../../infrastructure/audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../shared/constants/index.js';
import { AuthorizationError, ValidationError } from '../../shared/errors/index.js';

const apiKeyService = new ApiKeyService(prisma);

const issueKeySchema = z.object({
  scopes: z
    .array(z.enum(['PAYMENTS_READ', 'PAYMENTS_WRITE', 'TRANSACTIONS_READ', 'REFUNDS_WRITE']))
    .min(1),
  description: z.string().max(200).optional(),
});

const keyIdParamSchema = z.object({ id: z.string().uuid() });

function requireMerchantSession(req: FastifyRequest): string {
  if (!req.session?.merchantId) {
    throw new AuthorizationError('This action requires a merchant account session.');
  }
  return req.session.merchantId;
}

/**
 * Mirrors the admin-only key issuance in merchant.routes.ts, but scoped so a
 * merchant can self-serve their own keys without needing an administrator —
 * this is what the dashboard's "API Keys" page (shown in the frontend
 * mockups) actually calls. Every operation here is hard-scoped to the
 * session's own merchantId; there is no path from this router to another
 * merchant's keys.
 */
export async function registerMerchantSelfServiceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/merchant/api-keys',
    { preHandler: [requireUserSession] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const merchantId = requireMerchantSession(req);
      const keys = await prisma.apiKey.findMany({
        where: { merchantId },
        select: {
          id: true,
          keyPrefix: true,
          scopes: true,
          description: true,
          revokedAt: true,
          lastUsedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      return sendSuccess(reply, 200, req.id, { items: keys });
    },
  );

  app.post(
    '/api/v1/merchant/api-keys',
    { preHandler: [requireUserSession] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const merchantId = requireMerchantSession(req);
      if (req.session!.role === 'MERCHANT_STAFF') {
        throw new AuthorizationError('Only the merchant owner can issue new API keys.');
      }

      const input = issueKeySchema.parse(req.body);
      const issued = await apiKeyService.issueMerchantKey(
        merchantId,
        input.scopes,
        input.description,
      );

      await new AuditService(prisma).record({
        action: AUDIT_ACTIONS.ADMIN_ACTION,
        actorType: 'USER',
        actorUserId: req.session!.userId,
        requestId: req.id,
        metadata: { action: 'api_key.self_issued', merchantId, apiKeyId: issued.apiKeyId },
      });

      return sendSuccess(reply, 201, req.id, {
        apiKeyId: issued.apiKeyId,
        apiKey: issued.plaintext,
        scopes: input.scopes,
      });
    },
  );

  app.post(
    '/api/v1/merchant/api-keys/:id/revoke',
    { preHandler: [requireUserSession] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const merchantId = requireMerchantSession(req);
      const { id } = keyIdParamSchema.parse(req.params);

      const key = await prisma.apiKey.findUnique({ where: { id } });
      if (!key || key.merchantId !== merchantId) {
        throw new ValidationError('API key does not belong to your merchant account.');
      }

      await apiKeyService.revokeKey(id);

      await new AuditService(prisma).record({
        action: AUDIT_ACTIONS.ADMIN_ACTION,
        actorType: 'USER',
        actorUserId: req.session!.userId,
        requestId: req.id,
        metadata: { action: 'api_key.self_revoked', merchantId, apiKeyId: id },
      });

      return sendSuccess(reply, 200, req.id, { apiKeyId: id, revoked: true });
    },
  );
}
