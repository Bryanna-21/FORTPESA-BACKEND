import { loadEnv } from '../../infrastructure/configuration/env.js';

/**
 * Everything Fortpesa-specific and environment-dependent lives here so the
 * rest of the adapter never reads process.env directly. Fields marked
 * "confirmed" were taken verbatim from Fortpesa's public developer-API
 * marketing page (fortpesa.co.ke) at build time. Fields marked "assumed"
 * are not published anywhere the build could verify and must be checked
 * against the merchant dashboard's own API reference before go-live — see
 * docs/fortpesa.md for the full list and how to correct them.
 */
export function getFortpesaConfig() {
  const env = loadEnv();

  return {
    baseUrl: env.FORTPESA_BASE_URL,
    apiKey: env.FORTPESA_API_KEY,
    webhookSecret: env.FORTPESA_WEBHOOK_SECRET,
    timeoutMs: env.FORTPESA_TIMEOUT_MS,

    // Confirmed: POST {baseUrl}/api/v1/payments/stk, Bearer auth, JSON body
    // {amount, phone, account_reference}, 201 response
    // {data: {uuid, status, platform_fee}}.
    stkPath: env.FORTPESA_STK_PATH,

    // Assumed: no status-lookup path is shown publicly beyond "poll any
    // payment by UUID until it settles." A REST-conventional path is used
    // as the default and is fully overridable via FORTPESA_STATUS_PATH_TEMPLATE.
    statusPathTemplate: env.FORTPESA_STATUS_PATH_TEMPLATE,

    // Assumed: wallet balance endpoint is mentioned but its path is not
    // published. Overridable via FORTPESA_WALLET_BALANCE_PATH.
    walletBalancePath: env.FORTPESA_WALLET_BALANCE_PATH,

    // Confirmed: webhooks are "HMAC-SHA256 events for success, failure, and
    // expiry." Assumed: the exact header name carrying the signature is not
    // published; defaults to X-Fortpesa-Signature and is overridable via
    // FORTPESA_WEBHOOK_SIGNATURE_HEADER.
    webhookSignatureHeader: env.FORTPESA_WEBHOOK_SIGNATURE_HEADER,
  } as const;
}

export type FortpesaConfig = ReturnType<typeof getFortpesaConfig>;
