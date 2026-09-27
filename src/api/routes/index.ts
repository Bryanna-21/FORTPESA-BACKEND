import type { FastifyInstance } from 'fastify';
import { registerPaymentRoutes } from '../../modules/payments/payment.routes.js';
import { registerTransactionRoutes } from '../../modules/transactions/transaction.routes.js';
import { registerWebhookRoutes } from '../../modules/webhooks/webhook.routes.js';
import { registerReceiptRoutes } from '../../modules/receipts/receipt.routes.js';
import { registerAdminRoutes } from '../../modules/admin/admin.routes.js';
import { registerMerchantAdminRoutes } from '../../modules/merchants/merchant.routes.js';
import { registerMerchantSelfServiceRoutes } from '../../modules/merchants/merchant-self.routes.js';
import { registerReconciliationRoutes } from '../../modules/reconciliation/reconciliation.routes.js';
import { registerAuthRoutes } from '../../modules/auth/auth.routes.js';
import { registerRefundRoutes } from '../../modules/refunds/refund.routes.js';
import { registerWalletRoutes } from '../../modules/wallet/wallet.routes.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { redis } from '../../infrastructure/queue/queue.js';
import { sendSuccess } from '../response.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (req, reply) => sendSuccess(reply, 200, req.id, { status: 'ok' }));

  app.get('/ready', async (req, reply) => {
    const checks = { database: false, redis: false };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      const pong = await redis.ping();
      checks.redis = pong === 'PONG';
    } catch {
      checks.redis = false;
    }

    const isReady = checks.database && checks.redis;
    return sendSuccess(reply, isReady ? 200 : 503, req.id, { status: isReady ? 'ready' : 'not_ready', checks });
  });

  await registerPaymentRoutes(app);
  await registerTransactionRoutes(app);
  await registerWebhookRoutes(app);
  await registerReceiptRoutes(app);
  await registerAdminRoutes(app);
  await registerMerchantAdminRoutes(app);
  await registerMerchantSelfServiceRoutes(app);
  await registerReconciliationRoutes(app);
  await registerAuthRoutes(app);
  await registerRefundRoutes(app);
  await registerWalletRoutes(app);
}
