import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../infrastructure/database/prisma.js';
import { requireAdmin, requireAuthentication } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../api/response.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../shared/constants/index.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

const paymentFilterSchema = paginationSchema.extend({
  status: z
    .enum(['CREATED', 'PROCESSING', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED'])
    .optional(),
  merchantId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/**
 * Every admin route in this module is read/inspect-only or delegates to an
 * audited, idempotent service (reconciliation). There is deliberately no
 * "mark payment paid" style endpoint — see docs/security.md.
 */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  const guard = [requireAuthentication, requireAdmin];

  app.get(
    '/api/v1/admin/payments',
    { preHandler: guard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const query = paymentFilterSchema.parse(req.query);
      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.merchantId) where.merchantId = query.merchantId;
      if (query.from || query.to) {
        where.createdAt = {
          ...(query.from ? { gte: query.from } : {}),
          ...(query.to ? { lte: query.to } : {}),
        };
      }

      const [items, total] = await prisma.$transaction([
        prisma.payment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.payment.count({ where }),
      ]);

      return sendSuccess(reply, 200, req.id, { items, pagination: { ...query, total } });
    },
  );

  app.get(
    '/api/v1/admin/transactions',
    { preHandler: guard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const query = paginationSchema.parse(req.query);
      const [items, total] = await prisma.$transaction([
        prisma.providerTransaction.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.providerTransaction.count(),
      ]);
      return sendSuccess(reply, 200, req.id, { items, pagination: { ...query, total } });
    },
  );

  app.get(
    '/api/v1/admin/webhooks',
    { preHandler: guard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const query = paginationSchema.parse(req.query);
      const [items, total] = await prisma.$transaction([
        prisma.webhookEvent.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.webhookEvent.count(),
      ]);
      return sendSuccess(reply, 200, req.id, { items, pagination: { ...query, total } });
    },
  );

  app.get(
    '/api/v1/admin/audit-logs',
    { preHandler: guard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const query = paginationSchema.parse(req.query);
      const [items, total] = await prisma.$transaction([
        prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.auditLog.count(),
      ]);
      return sendSuccess(reply, 200, req.id, { items, pagination: { ...query, total } });
    },
  );

  app.get(
    '/api/v1/admin/reports',
    { preHandler: guard },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const [totalsByStatus, totalSucceededMinor, totalFeesMinor] = await Promise.all([
        prisma.payment.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.ledgerEntry.aggregate({
          where: { type: 'PAYMENT' },
          _sum: { amountMinor: true },
        }),
        prisma.ledgerEntry.aggregate({
          where: { type: 'FEE' },
          _sum: { amountMinor: true },
        }),
      ]);

      return sendSuccess(reply, 200, req.id, {
        paymentsByStatus: totalsByStatus.map((row) => ({
          status: row.status,
          count: row._count._all,
        })),
        totalSettledMinor: totalSucceededMinor._sum.amountMinor ?? 0,
        totalFeesMinor: totalFeesMinor._sum.amountMinor ?? 0,
      });
    },
  );
}
