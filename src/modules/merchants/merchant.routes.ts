import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MerchantService } from './merchant.service.js';
import { ApiKeyService } from '../auth/apiKey.service.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { requireAdmin, requireAuthentication } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../api/response.js';
import { AuditService } from '../../infrastructure/audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../shared/constants/index.js';

const merchantService = new MerchantService(prisma);
const apiKeyService = new ApiKeyService(prisma);

const createMerchantSchema = z.object({ name: z.string().min(1).max(200) });
const issueKeySchema = z.object({
  scopes: z
    .array(z.enum(['PAYMENTS_READ', 'PAYMENTS_WRITE', 'TRANSACTIONS_READ', 'REFUNDS_WRITE']))
    .min(1),
  description: z.string().max(200).optional(),
});
const merchantIdParamSchema = z.object({ id: z.string().uuid() });

export async function registerMerchantAdminRoutes(app: FastifyInstance): Promise<void> {
  const guard = [requireAuthentication, requireAdmin];

  app.post(
    '/api/v1/admin/merchants',
    { preHandler: guard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const input = createMerchantSchema.parse(req.body);
      const merchant = await merchantService.create(input.name);

      await new AuditService(prisma).record({
        action: AUDIT_ACTIONS.ADMIN_ACTION,
        actorType: 'ADMIN_API_KEY',
        actorUserId: req.principal?.apiKeyId,
        requestId: req.id,
        metadata: { action: 'merchant.created', merchantId: merchant.id },
      });

      return sendSuccess(reply, 201, req.id, merchant);
    },
  );

  app.post(
    '/api/v1/admin/merchants/:id/api-keys',
    { preHandler: guard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = merchantIdParamSchema.parse(req.params);
      const input = issueKeySchema.parse(req.body);

      await merchantService.getById(id);
      const issued = await apiKeyService.issueMerchantKey(id, input.scopes, input.description);

      await new AuditService(prisma).record({
        action: AUDIT_ACTIONS.ADMIN_ACTION,
        actorType: 'ADMIN_API_KEY',
        actorUserId: req.principal?.apiKeyId,
        requestId: req.id,
        metadata: { action: 'api_key.issued', merchantId: id, apiKeyId: issued.apiKeyId },
      });

      // The plaintext key is returned exactly once and is never retrievable
      // again — only its hash is stored.
      return sendSuccess(reply, 201, req.id, {
        apiKeyId: issued.apiKeyId,
        apiKey: issued.plaintext,
        scopes: input.scopes,
      });
    },
  );

  app.post(
    '/api/v1/admin/api-keys/:id/revoke',
    { preHandler: guard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = merchantIdParamSchema.parse(req.params);
      await apiKeyService.revokeKey(id);

      await new AuditService(prisma).record({
        action: AUDIT_ACTIONS.ADMIN_ACTION,
        actorType: 'ADMIN_API_KEY',
        actorUserId: req.principal?.apiKeyId,
        requestId: req.id,
        metadata: { action: 'api_key.revoked', apiKeyId: id },
      });

      return sendSuccess(reply, 200, req.id, { apiKeyId: id, revoked: true });
    },
  );
}
