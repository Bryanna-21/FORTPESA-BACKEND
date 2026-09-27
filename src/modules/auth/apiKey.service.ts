import type { PrismaClient } from '@prisma/client';
import {
  generateApiKey,
  splitApiKey,
  verifyApiKeySecret,
} from '../../infrastructure/security/apiKey.js';
import { AuthenticationError } from '../../shared/errors/index.js';
import type { ApiKeyScope, AuthenticatedPrincipal } from '../../shared/types/index.js';

export class ApiKeyService {
  constructor(private readonly db: PrismaClient) {}

  async issueMerchantKey(
    merchantId: string,
    scopes: ApiKeyScope[],
    description?: string,
  ): Promise<{ plaintext: string; apiKeyId: string }> {
    const generated = generateApiKey('merchant');
    const record = await this.db.apiKey.create({
      data: {
        merchantId,
        keyPrefix: generated.keyPrefix,
        hashedKey: generated.hashedKey,
        scopes,
        description,
      },
    });
    return { plaintext: generated.plaintext, apiKeyId: record.id };
  }

  async issueAdminKey(
    scopes: ApiKeyScope[],
    description?: string,
  ): Promise<{ plaintext: string; apiKeyId: string }> {
    const generated = generateApiKey('admin');
    const record = await this.db.apiKey.create({
      data: {
        keyPrefix: generated.keyPrefix,
        hashedKey: generated.hashedKey,
        scopes,
        description,
      },
    });
    return { plaintext: generated.plaintext, apiKeyId: record.id };
  }

  async revokeKey(apiKeyId: string): Promise<void> {
    await this.db.apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: new Date() },
    });
  }

  async authenticate(plaintext: string): Promise<AuthenticatedPrincipal> {
    const split = splitApiKey(plaintext);
    if (!split) {
      throw new AuthenticationError('Malformed API key.');
    }

    const record = await this.db.apiKey.findUnique({ where: { keyPrefix: split.keyPrefix } });
    if (!record || record.revokedAt) {
      throw new AuthenticationError('Invalid or revoked API key.');
    }

    const isValid = verifyApiKeySecret(split.secret, record.hashedKey);
    if (!isValid) {
      throw new AuthenticationError('Invalid or revoked API key.');
    }

    // Fire-and-forget last-used tracking; auth must not fail if this update
    // races with a concurrent request or the write briefly lags.
    void this.db.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    const scopes = record.scopes as ApiKeyScope[];
    return {
      apiKeyId: record.id,
      merchantId: record.merchantId,
      scopes,
      isAdmin: scopes.includes('ADMIN'),
    };
  }
}
