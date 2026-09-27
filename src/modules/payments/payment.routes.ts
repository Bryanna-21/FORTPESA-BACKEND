import type { FastifyInstance } from 'fastify';
import { requireAuthentication, requireScope } from '../auth/auth.middleware.js';
import { PAYMENT_CREATE_RATE_LIMIT } from '../../api/middleware/rateLimit.js';
import {
  cancelPaymentHandler,
  createPaymentHandler,
  getPaymentHandler,
  getPaymentStatusHandler,
  listPaymentsHandler,
  retryPaymentHandler,
} from './payment.controller.js';

export async function registerPaymentRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/payments',
    {
      preHandler: [requireAuthentication, requireScope('PAYMENTS_WRITE')],
      config: { rateLimit: PAYMENT_CREATE_RATE_LIMIT },
    },
    createPaymentHandler,
  );

  app.get(
    '/api/v1/payments',
    { preHandler: [requireAuthentication, requireScope('PAYMENTS_READ')] },
    listPaymentsHandler,
  );

  app.get(
    '/api/v1/payments/:id',
    { preHandler: [requireAuthentication, requireScope('PAYMENTS_READ')] },
    getPaymentHandler,
  );

  app.get(
    '/api/v1/payments/:id/status',
    { preHandler: [requireAuthentication, requireScope('PAYMENTS_READ')] },
    getPaymentStatusHandler,
  );

  app.post(
    '/api/v1/payments/:id/retry',
    {
      preHandler: [requireAuthentication, requireScope('PAYMENTS_WRITE')],
      config: { rateLimit: PAYMENT_CREATE_RATE_LIMIT },
    },
    retryPaymentHandler,
  );

  app.post(
    '/api/v1/payments/:id/cancel',
    { preHandler: [requireAuthentication, requireScope('PAYMENTS_WRITE')] },
    cancelPaymentHandler,
  );
}
