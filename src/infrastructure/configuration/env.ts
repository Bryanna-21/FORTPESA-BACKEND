import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_BASE_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  FORTPESA_BASE_URL: z.string().url(),
  FORTPESA_API_KEY: z.string().min(1),
  FORTPESA_WEBHOOK_SECRET: z.string().min(1),
  FORTPESA_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  FORTPESA_WEBHOOK_SIGNATURE_HEADER: z.string().default('X-Fortpesa-Signature'),
  FORTPESA_STK_PATH: z.string().default('/api/v1/payments/stk'),
  FORTPESA_STATUS_PATH_TEMPLATE: z.string().default('/api/v1/payments/{uuid}'),
  FORTPESA_WALLET_BALANCE_PATH: z.string().default('/api/v1/wallet/balance'),

  API_KEY_PEPPER: z.string().min(32),
  ADMIN_API_KEY_PREFIX: z.string().default('fpa_admin_'),
  MERCHANT_API_KEY_PREFIX: z.string().default('fpa_live_'),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 12),

  PAYMENT_EXPIRY_MINUTES: z.coerce.number().int().positive().default(15),
  MAX_PAYMENT_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),
  MIN_PAYMENT_AMOUNT_MINOR_UNITS: z.coerce.number().int().positive().default(100),
  MAX_PAYMENT_AMOUNT_MINOR_UNITS: z.coerce.number().int().positive().default(15_000_000),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

/** Test-only hook to reset the cached configuration between test cases. */
export function __resetEnvCacheForTests(): void {
  cachedEnv = undefined;
}
