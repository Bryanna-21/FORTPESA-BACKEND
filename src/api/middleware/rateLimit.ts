import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { redis } from '../../infrastructure/queue/queue.js';
import { RateLimitedError } from '../../shared/errors/index.js';

/**
 * Global default plus per-route overrides. Routes with higher-risk abuse
 * potential (payment creation, webhooks, admin) get their own explicit
 * limits set via the route's `config.rateLimit` option; everything else
 * falls back to this default.
 */
export async function registerRateLimiting(app: FastifyInstance): Promise<void> {
  await app.register(fastifyRateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (req) => req.principal?.merchantId ?? req.ip,
    errorResponseBuilder: (req, context) => {
      const err = new RateLimitedError('Too many requests. Please slow down.', {
        limit: context.max,
        windowMs: context.after,
      });
      return {
        success: false,
        error: { code: err.code, message: err.message, requestId: req.id, details: err.details },
      };
    },
  });
}

export const PAYMENT_CREATE_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };
export const WEBHOOK_RATE_LIMIT = { max: 300, timeWindow: '1 minute' };
export const ADMIN_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };
export const AUTH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };
