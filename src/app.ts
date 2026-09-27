import Fastify, { type FastifyInstance } from 'fastify';
import { logger } from './infrastructure/logging/logger.js';
import { genReqId } from './api/middleware/requestId.js';
import { registerErrorHandler } from './api/middleware/errorHandler.js';
import { registerRateLimiting } from './api/middleware/rateLimit.js';
import { registerRoutes } from './api/routes/index.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger,
    genReqId,
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MiB; payment payloads are small.
  });

  // The Fortpesa webhook route needs the exact raw bytes of the request body
  // to verify the HMAC signature, so JSON parsing is skipped specifically
  // for that content type on that path and the body is handed through as a
  // Buffer instead. Every other route uses Fastify's default JSON parser.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body: Buffer, done) => {
      if (req.url === '/api/v1/webhooks/fortpesa') {
        done(null, body);
        return;
      }
      try {
        const json = body.length > 0 ? JSON.parse(body.toString('utf8')) : {};
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await registerRateLimiting(app);
  registerErrorHandler(app);
  await registerRoutes(app);

  return app;
}
