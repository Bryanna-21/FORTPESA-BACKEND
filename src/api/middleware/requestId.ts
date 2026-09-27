import { generateRequestId } from '../../shared/utilities/requestId.js';

/** Passed as `genReqId` when constructing the Fastify instance in app.ts. */
export function genReqId(): string {
  return generateRequestId();
}
