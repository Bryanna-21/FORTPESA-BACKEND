import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getFortpesaProvider } from '../../providers/fortpesa/index.js';
import { requireAuthentication, requireScope } from '../auth/auth.middleware.js';
import { sendSuccess } from '../../api/response.js';
import { InternalError } from '../../shared/errors/index.js';

const provider = getFortpesaProvider();

/**
 * Fortpesa's public page states the wallet balance endpoint is readable
 * "with any API key" — i.e. it reflects the platform account's own prepaid
 * fee wallet, not a per-merchant balance. Exposed here read-only, scoped
 * the same as other payment-read operations, since it's informational
 * account data rather than a merchant-owned resource.
 */
export async function registerWalletRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/wallet/balance',
    { preHandler: [requireAuthentication, requireScope('PAYMENTS_READ')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!provider.getWalletBalance) {
        throw new InternalError('Wallet balance is not available for the configured provider.');
      }
      const balance = await provider.getWalletBalance();
      return sendSuccess(reply, 200, req.id, {
        balance: balance.balanceMinor,
        currency: balance.currency,
      });
    },
  );
}
