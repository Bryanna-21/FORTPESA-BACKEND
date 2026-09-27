import type {
  GetPaymentStatusInput,
  InitiatePaymentInput,
  ProviderPaymentResult,
  ProviderPaymentStatus,
  VerifiedWebhookEvent,
  WalletBalance,
} from '../PaymentProvider.js';
import type {
  FortpesaStatusResponse,
  FortpesaStkRequest,
  FortpesaStkResponse,
  FortpesaWalletBalanceResponse,
  FortpesaWebhookPayload,
} from './types.js';
import { FortpesaApiError } from './errors.js';

export function toStkRequest(input: InitiatePaymentInput): FortpesaStkRequest {
  return {
    amount: input.amountMinor,
    phone: toFortpesaPhoneFormat(input.phoneNormalized),
    account_reference: input.accountReference,
    ...(input.description ? { description: input.description } : {}),
  };
}

/**
 * The confirmed example on fortpesa.co.ke sends a local-format subscriber
 * number ("0712345678") rather than the 254-prefixed E.164 form. Our
 * internal canonical format is 254-prefixed, so we convert back out at the
 * adapter boundary — this keeps the 254-prefixed convention consistent
 * everywhere else in the codebase.
 */
function toFortpesaPhoneFormat(canonical254: string): string {
  return `0${canonical254.slice(3)}`;
}

function mapRawStatusToPending(rawStatus: string): 'PENDING' | 'FAILED' {
  const normalized = rawStatus.toLowerCase();
  if (normalized === 'pending' || normalized === 'processing') return 'PENDING';
  return 'FAILED';
}

export function fromStkResponse(response: FortpesaStkResponse): ProviderPaymentResult {
  return {
    providerTransactionId: response.data.uuid,
    providerReference: response.data.reference,
    status: mapRawStatusToPending(response.data.status),
    rawStatus: response.data.status,
    platformFeeMinor: response.data.platform_fee,
    raw: response,
  };
}

function mapRawStatusToSettled(rawStatus: string): 'PENDING' | 'SUCCEEDED' | 'FAILED' {
  const normalized = rawStatus.toLowerCase();
  if (['succeeded', 'success', 'completed'].includes(normalized)) return 'SUCCEEDED';
  if (['failed', 'cancelled', 'declined'].includes(normalized)) return 'FAILED';
  return 'PENDING';
}

export function fromStatusResponse(
  _input: GetPaymentStatusInput,
  response: FortpesaStatusResponse,
): ProviderPaymentStatus {
  return {
    providerTransactionId: response.data.uuid,
    status: mapRawStatusToSettled(response.data.status),
    rawStatus: response.data.status,
    raw: response,
  };
}

export function fromWebhookPayload(payload: FortpesaWebhookPayload): VerifiedWebhookEvent {
  const eventToStatus: Record<FortpesaWebhookPayload['event'], VerifiedWebhookEvent['status']> = {
    'payment.succeeded': 'SUCCEEDED',
    'payment.failed': 'FAILED',
    'payment.expired': 'EXPIRED',
  };

  const status = eventToStatus[payload.event];
  if (!status) {
    throw new FortpesaApiError(`Unrecognized Fortpesa webhook event type: ${payload.event}`, 400, {
      event: payload.event,
    });
  }

  return {
    providerEventId: payload.event_id,
    providerTransactionId: payload.data.uuid,
    eventType: payload.event,
    status,
    amountMinor: payload.data.amount,
    currency: payload.data.currency ?? 'KES',
    raw: payload,
  };
}

export function fromWalletBalanceResponse(response: FortpesaWalletBalanceResponse): WalletBalance {
  return {
    balanceMinor: response.data.balance,
    currency: response.data.currency ?? 'KES',
    raw: response,
  };
}
