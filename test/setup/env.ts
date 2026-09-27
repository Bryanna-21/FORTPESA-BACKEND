/**
 * Populates process.env with syntactically valid, non-production values
 * before any application module loads its configuration. Nothing here is a
 * real credential — see .env.example for the production variable list.
 */
process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '3000';
process.env.LOG_LEVEL ??= 'info';
process.env.APP_BASE_URL ??= 'http://localhost:3000';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.FORTPESA_BASE_URL ??= 'https://fortpesa.co.ke';
process.env.FORTPESA_API_KEY ??= 'pb_live_test_key';
process.env.FORTPESA_WEBHOOK_SECRET ??= 'test-webhook-secret';
process.env.FORTPESA_TIMEOUT_MS ??= '15000';
process.env.FORTPESA_WEBHOOK_SIGNATURE_HEADER ??= 'X-Fortpesa-Signature';
process.env.FORTPESA_STK_PATH ??= '/api/v1/payments/stk';
process.env.FORTPESA_STATUS_PATH_TEMPLATE ??= '/api/v1/payments/{uuid}';
process.env.FORTPESA_WALLET_BALANCE_PATH ??= '/api/v1/wallet/balance';
process.env.API_KEY_PEPPER ??= '0'.repeat(64);
process.env.ADMIN_API_KEY_PREFIX ??= 'fpa_admin_';
process.env.MERCHANT_API_KEY_PREFIX ??= 'fpa_live_';
process.env.SESSION_SECRET ??= '1'.repeat(64);
process.env.SESSION_TTL_MINUTES ??= '720';
process.env.PAYMENT_EXPIRY_MINUTES ??= '15';
process.env.MAX_PAYMENT_RETRY_ATTEMPTS ??= '3';
process.env.MIN_PAYMENT_AMOUNT_MINOR_UNITS ??= '100';
process.env.MAX_PAYMENT_AMOUNT_MINOR_UNITS ??= '15000000';
