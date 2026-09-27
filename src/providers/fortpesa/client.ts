import { request } from 'undici';
import type {
  GetPaymentStatusInput,
  InitiatePaymentInput,
  PaymentProvider,
  ProviderPaymentResult,
  ProviderPaymentStatus,
  VerifiedWebhookEvent,
  VerifyWebhookInput,
  WalletBalance,
} from '../PaymentProvider.js';
import { getFortpesaConfig } from './config.js';
import {
  fromStatusResponse,
  fromStkResponse,
  fromWalletBalanceResponse,
  fromWebhookPayload,
  toStkRequest,
} from './mapper.js';
import { verifyFortpesaWebhookSignature, parseFortpesaWebhookPayload } from './webhook.js';
import { FortpesaApiError } from './errors.js';
import { ProviderTimeoutError } from '../../shared/errors/index.js';
import type {
  FortpesaErrorResponse,
  FortpesaStatusResponse,
  FortpesaStkResponse,
  FortpesaWalletBalanceResponse,
} from './types.js';
import { logger } from '../../infrastructure/logging/logger.js';

const log = logger.child({ module: 'fortpesa.client' });

export class FortpesaProvider implements PaymentProvider {
  readonly name = 'fortpesa';

  async initiatePayment(input: InitiatePaymentInput): Promise<ProviderPaymentResult> {
    const config = getFortpesaConfig();
    const body = toStkRequest(input);

    const response = await this.post<FortpesaStkResponse>(config.stkPath, body);
    return fromStkResponse(response);
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<ProviderPaymentStatus> {
    const config = getFortpesaConfig();
    const path = config.statusPathTemplate.replace('{uuid}', input.providerTransactionId);

    const response = await this.get<FortpesaStatusResponse>(path);
    return fromStatusResponse(input, response);
  }

  verifyWebhook(input: VerifyWebhookInput): VerifiedWebhookEvent {
    verifyFortpesaWebhookSignature(input);
    const payload = parseFortpesaWebhookPayload(input.rawBody);
    return fromWebhookPayload(payload);
  }

  async getWalletBalance(): Promise<WalletBalance> {
    const config = getFortpesaConfig();
    const response = await this.get<FortpesaWalletBalanceResponse>(config.walletBalancePath);
    return fromWalletBalanceResponse(response);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const config = getFortpesaConfig();
    const url = new URL(path, config.baseUrl).toString();

    let response;
    try {
      response = await request(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        bodyTimeout: config.timeoutMs,
        headersTimeout: config.timeoutMs,
      });
    } catch (err) {
      log.error({ err, url }, 'Fortpesa request failed before receiving a response');
      throw new ProviderTimeoutError('fortpesa', { url });
    }

    return this.parseResponse<T>(response, url);
  }

  private async get<T>(path: string): Promise<T> {
    const config = getFortpesaConfig();
    const url = new URL(path, config.baseUrl).toString();

    let response;
    try {
      response = await request(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        bodyTimeout: config.timeoutMs,
        headersTimeout: config.timeoutMs,
      });
    } catch (err) {
      log.error({ err, url }, 'Fortpesa request failed before receiving a response');
      throw new ProviderTimeoutError('fortpesa', { url });
    }

    return this.parseResponse<T>(response, url);
  }

  private async parseResponse<T>(
    response: Awaited<ReturnType<typeof request>>,
    url: string,
  ): Promise<T> {
    const text = await response.body.text();
    const json = text.length > 0 ? safeJsonParse(text) : undefined;

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return json as T;
    }

    const errorBody = json as FortpesaErrorResponse | undefined;
    const message =
      errorBody?.error?.message ?? errorBody?.message ?? `Fortpesa returned HTTP ${response.statusCode}`;

    log.warn({ url, status: response.statusCode, body: json }, 'Fortpesa returned an error response');
    throw new FortpesaApiError(message, response.statusCode, { url, body: json });
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
