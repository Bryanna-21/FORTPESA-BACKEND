import type { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../../infrastructure/security/password.js';
import { issueSessionToken } from '../../infrastructure/security/sessionToken.js';
import { AuthenticationError, ConflictError, ValidationError } from '../../shared/errors/index.js';
import { loadEnv } from '../../infrastructure/configuration/env.js';

export interface RegisterMerchantInput {
  merchantName: string;
  email: string;
  password: string;
}

export interface AuthenticatedSession {
  token: string;
  expiresAt: string;
  user: { id: string; email: string; role: string; merchantId: string | null };
}

const MIN_PASSWORD_LENGTH = 10;

export class UserService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Registers a new merchant business together with its first user, who
   * becomes the merchant owner. This is the human-facing counterpart to
   * admin-issued API keys: a person can sign in to a dashboard, while their
   * backend integration authenticates with the API key issued alongside
   * (see MerchantService.create / ApiKeyService.issueMerchantKey).
   */
  async registerMerchant(input: RegisterMerchantInput): Promise<AuthenticatedSession> {
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictError('An account with this email already exists.');
    }

    const merchant = await this.db.merchant.create({ data: { name: input.merchantName } });
    const user = await this.db.user.create({
      data: {
        email: input.email,
        passwordHash: hashPassword(input.password),
        role: 'MERCHANT_OWNER',
        merchantId: merchant.id,
      },
    });

    return this.issueSession(user);
  }

  async login(email: string, password: string): Promise<AuthenticatedSession> {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      // Deliberately identical error for "no such user" and "wrong
      // password" so the response never confirms which emails are
      // registered.
      throw new AuthenticationError('Invalid email or password.');
    }

    return this.issueSession(user);
  }

  private issueSession(user: {
    id: string;
    email: string;
    role: string;
    merchantId: string | null;
  }): AuthenticatedSession {
    const env = loadEnv();
    const expiresAt = Date.now() + env.SESSION_TTL_MINUTES * 60_000;

    const token = issueSessionToken({
      userId: user.id,
      merchantId: user.merchantId,
      role: user.role as 'ADMIN' | 'MERCHANT_OWNER' | 'MERCHANT_STAFF',
      expiresAt,
    });

    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      user: { id: user.id, email: user.email, role: user.role, merchantId: user.merchantId },
    };
  }
}
