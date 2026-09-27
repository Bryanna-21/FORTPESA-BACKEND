/**
 * Wire types for the Fortpesa API. Field names mirror what Fortpesa's public
 * developer-API example shows verbatim (docs/fortpesa.md documents which
 * fields are confirmed vs assumed).
 */

/** Confirmed request shape for POST /api/v1/payments/stk. */
export interface FortpesaStkRequest {
  amount: number;
  phone: string;
  account_reference: string;
  description?: string;
}

/** Confirmed response envelope: {"data": {"uuid": "...", "status": "pending", "platform_fee": 600}}. */
export interface FortpesaStkResponse {
  data: {
    uuid: string;
    status: string;
    platform_fee: number;
    reference?: string;
  };
}

/**
 * Assumed shape for a status-lookup response, modeled on the same envelope
 * the STK response uses since Fortpesa states transactions are polled "by
 * UUID until it settles." Adjust field names here if the confirmed schema
 * differs — this is the only file that needs to change.
 */
export interface FortpesaStatusResponse {
  data: {
    uuid: string;
    status: string;
    amount?: number;
    currency?: string;
  };
}

/**
 * Assumed webhook payload shape. Fortpesa confirms HMAC-SHA256-signed events
 * "for success, failure, and expiry" but does not publish the payload
 * schema. Modeled on the STK response envelope for consistency; verify
 * against a captured live payload before production cutover.
 */
export interface FortpesaWebhookPayload {
  event: 'payment.succeeded' | 'payment.failed' | 'payment.expired';
  event_id?: string;
  data: {
    uuid: string;
    status: string;
    amount: number;
    currency?: string;
    reference?: string;
  };
}

/**
 * Assumed shape for the wallet balance endpoint, modeled the same way as
 * the status response since neither is publicly documented in detail.
 */
export interface FortpesaWalletBalanceResponse {
  data: {
    balance: number;
    currency?: string;
  };
}

export interface FortpesaErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
}
