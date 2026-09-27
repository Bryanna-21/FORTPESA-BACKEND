import type { VerifyWebhookInput } from '../PaymentProvider.js';
import type { FortpesaWebhookPayload } from './types.js';
import { getFortpesaConfig } from './config.js';
import { verifyHmacSha256 } from '../../infrastructure/security/hmac.js';
import { WebhookVerificationError } from '../../shared/errors/index.js';

function extractSignatureHeader(
  headers: Record<string, string | string[] | undefined>,
  headerName: string,
): string {
  const value = headers[headerName.toLowerCase()] ?? headers[headerName];
  if (!value) {
    throw new WebhookVerificationError('Webhook is missing the expected signature header.', {
      expectedHeader: headerName,
    });
  }
  return Array.isArray(value) ? value[0]! : value;
}

export function verifyFortpesaWebhookSignature(input: VerifyWebhookInput): void {
  const config = getFortpesaConfig();
  const signature = extractSignatureHeader(input.headers, config.webhookSignatureHeader);

  const isValid = verifyHmacSha256(input.rawBody, signature, config.webhookSecret);
  if (!isValid) {
    throw new WebhookVerificationError('Webhook signature verification failed.');
  }
}

export function parseFortpesaWebhookPayload(rawBody: string): FortpesaWebhookPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new WebhookVerificationError('Webhook body is not valid JSON.');
  }

  if (!isFortpesaWebhookPayload(parsed)) {
    throw new WebhookVerificationError('Webhook body does not match the expected Fortpesa event shape.');
  }

  return parsed;
}

function isFortpesaWebhookPayload(value: unknown): value is FortpesaWebhookPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.event !== 'string') return false;
  if (typeof candidate.data !== 'object' || candidate.data === null) return false;
  const data = candidate.data as Record<string, unknown>;
  return typeof data.uuid === 'string' && typeof data.status === 'string';
}
