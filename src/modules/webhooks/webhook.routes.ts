import type { FastifyInstance } from 'fastify';
import { handleFortpesaWebhook } from './fortpesa.webhook.controller.js';
import { WEBHOOK_RATE_LIMIT } from '../../api/middleware/rateLimit.js';

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/webhooks/fortpesa',
    {
      config: { rateLimit: WEBHOOK_RATE_LIMIT },
      // The body is intentionally left as a raw Buffer (see app.ts content-type
      // parser override) so the HMAC signature can be verified against the
      // exact bytes Fortpesa signed, before any JSON parsing happens.
    },
    handleFortpesaWebhook,
  );
}
