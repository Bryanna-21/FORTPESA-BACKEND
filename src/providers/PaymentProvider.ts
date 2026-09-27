/**
 * Contract every payment provider adapter must satisfy. The payment engine
 * (src/modules/payments) depends only on this interface, never on a
 * provider-specific type — adding a second provider means writing a new
 * adapter, not touching the payment service.
 */

export interface InitiatePaymentInput {
  /** Our internal payment ID, threaded through as the client reference. */
  paymentId: string;
  amountMinor: number;
  currency: string;
  phoneNormalized: string;
  accountReference: string;
  description?: string;
}

export interface ProviderPaymentResult {
  providerTransactionId: string;
  providerReference?: string;
  status: 'PENDING' | 'FAILED';
  rawStatus: string;
  platformFeeMinor?: number;
  raw: unknown;
}

export interface GetPaymentStatusInput {
  providerTransactionId: string;
}

export interface ProviderPaymentStatus {
  providerTransactionId: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  rawStatus: string;
  raw: unknown;
}

export interface WalletBalance {
  balanceMinor: number;
  currency: string;
  raw: unknown;
}

export interface VerifyWebhookInput {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface VerifiedWebhookEvent {
  providerEventId: string | undefined;
  providerTransactionId: string;
  eventType: 'payment.succeeded' | 'payment.failed' | 'payment.expired';
  status: 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  amountMinor: number;
  currency: string;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  initiatePayment(input: InitiatePaymentInput): Promise<ProviderPaymentResult>;
  getPaymentStatus(input: GetPaymentStatusInput): Promise<ProviderPaymentStatus>;
  verifyWebhook(input: VerifyWebhookInput): VerifiedWebhookEvent;
  /**
   * Optional because it is not part of the core payment-collection flow —
   * only implement it where a provider actually confirms the capability.
   * Fortpesa's public page mentions a wallet balance endpoint; see
   * docs/fortpesa.md for the confirmed-vs-assumed detail.
   */
  getWalletBalance?(): Promise<WalletBalance>;
}
