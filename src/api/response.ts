import type { FastifyReply } from 'fastify';
import type { ApiSuccessResponse } from '../shared/types/index.js';

export function sendSuccess<T>(
  reply: FastifyReply,
  statusCode: number,
  requestId: string,
  data: T,
): FastifyReply {
  const body: ApiSuccessResponse<T> = { success: true, data, requestId };
  return reply.code(statusCode).send(body);
}
