import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { runReconciliation } from './reconciliation.worker.js';
import { requireAdmin, requireAuthentication } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../api/response.js';

export async function registerReconciliationRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/admin/reconciliation',
    { preHandler: [requireAuthentication, requireAdmin] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const result = await runReconciliation();
      return sendSuccess(reply, 200, req.id, result);
    },
  );
}
