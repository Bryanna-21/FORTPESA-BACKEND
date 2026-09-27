import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { UserService } from './user.service.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { requireUserSession } from './auth.middleware.js';
import { AUTH_RATE_LIMIT } from '../../api/middleware/rateLimit.js';
import { sendSuccess } from '../../api/response.js';
import { AuditService } from '../../infrastructure/audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../shared/constants/index.js';

const userService = new UserService(prisma);

const registerSchema = z.object({
  merchantName: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(10).max(200),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/auth/register',
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const input = registerSchema.parse(req.body);
      const session = await userService.registerMerchant(input);

      await new AuditService(prisma).record({
        action: AUDIT_ACTIONS.ADMIN_ACTION,
        actorType: 'USER',
        actorUserId: session.user.id,
        requestId: req.id,
        metadata: { action: 'merchant.self_registered', merchantId: session.user.merchantId },
      });

      return sendSuccess(reply, 201, req.id, session);
    },
  );

  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const input = loginSchema.parse(req.body);
      const session = await userService.login(input.email, input.password);
      return sendSuccess(reply, 200, req.id, session);
    },
  );

  app.get(
    '/api/v1/auth/me',
    { preHandler: [requireUserSession] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.session!.userId } });
      return sendSuccess(reply, 200, req.id, {
        id: user.id,
        email: user.email,
        role: user.role,
        merchantId: user.merchantId,
      });
    },
  );
}
