import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiKeyService } from './apiKey.service.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { verifySessionToken } from '../../infrastructure/security/sessionToken.js';
import { AuthenticationError, AuthorizationError } from '../../shared/errors/index.js';
import type { ApiKeyScope } from '../../shared/types/index.js';

const apiKeyService = new ApiKeyService(prisma);

declare module 'fastify' {
  interface FastifyRequest {
    principal?: import('../../shared/types/index.js').AuthenticatedPrincipal;
    session?: {
      userId: string;
      merchantId: string | null;
      role: 'ADMIN' | 'MERCHANT_OWNER' | 'MERCHANT_STAFF';
    };
  }
}

export async function requireAuthentication(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or malformed Authorization header.');
  }

  const token = header.slice('Bearer '.length).trim();
  req.principal = await apiKeyService.authenticate(token);
}

/**
 * Authenticates a human dashboard user via the signed session token issued
 * by POST /api/v1/auth/login or /register — distinct from
 * requireAuthentication, which authenticates a merchant's own backend via a
 * long-lived API key. Session-authenticated routes are for the dashboard a
 * person clicks around in; API-key routes are for server-to-server payment
 * operations. Keeping the two separate means a compromised dashboard
 * session token can never be used to call the payments API, and vice versa.
 */
export async function requireUserSession(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or malformed Authorization header.');
  }

  const token = header.slice('Bearer '.length).trim();
  const payload = verifySessionToken(token);
  req.session = { userId: payload.userId, merchantId: payload.merchantId, role: payload.role };
}

export function requireScope(scope: ApiKeyScope) {
  return async function scopedGuard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!req.principal) {
      throw new AuthenticationError('Authentication is required for this endpoint.');
    }
    if (req.principal.isAdmin) return;
    if (!req.principal.scopes.includes(scope)) {
      throw new AuthorizationError(`API key is missing the required scope: ${scope}`);
    }
  };
}

export async function requireAdmin(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!req.principal?.isAdmin) {
    throw new AuthorizationError('This endpoint requires an administrator API key.');
  }
}

/**
 * Ensures the authenticated merchant can only ever act on their own
 * resources, regardless of what ID appears in the URL. Admin principals
 * bypass this check by design.
 */
export function assertOwnsMerchant(
  principal: { merchantId: string | null; isAdmin: boolean },
  merchantId: string,
): void {
  if (principal.isAdmin) return;
  if (principal.merchantId !== merchantId) {
    throw new AuthorizationError('You do not have access to this resource.');
  }
}

