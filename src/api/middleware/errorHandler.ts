import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors/index.js';
import { logger } from '../../infrastructure/logging/logger.js';
import type { ApiErrorResponse } from '../../shared/types/index.js';

const log = logger.child({ module: 'error-handler' });

export function registerErrorHandler(app: import('fastify').FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) => {
    const requestId = req.id;

    if (error instanceof ZodError) {
      const body: ApiErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request failed validation.',
          requestId,
          details: { issues: error.issues },
        },
      };
      return reply.code(400).send(body);
    }

    if (error instanceof AppError) {
      if (error.httpStatus >= 500) {
        log.error({ err: error, requestId }, 'Application error');
      } else {
        log.warn({ err: error, requestId }, 'Handled client error');
      }

      const body: ApiErrorResponse = {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          requestId,
          details: error.details,
        },
      };
      return reply.code(error.httpStatus).send(body);
    }

    // Fastify's own validation/framework errors (malformed JSON, etc.).
    const fastifyError = error as FastifyError;
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      const body: ApiErrorResponse = {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: fastifyError.message,
          requestId,
        },
      };
      return reply.code(fastifyError.statusCode).send(body);
    }

    log.error({ err: error, requestId }, 'Unhandled error');
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
      },
    };
    return reply.code(500).send(body);
  });

  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.url} does not exist.`,
        requestId: req.id,
      },
    };
    return reply.code(404).send(body);
  });
}
