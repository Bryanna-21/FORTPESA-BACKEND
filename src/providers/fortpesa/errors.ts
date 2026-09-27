import { ProviderError } from '../../shared/errors/index.js';

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class FortpesaApiError extends ProviderError {
  constructor(
    message: string,
    public readonly httpStatusFromProvider: number,
    details?: Record<string, unknown>,
  ) {
    super(message, 'fortpesa', RETRYABLE_HTTP_STATUSES.has(httpStatusFromProvider), details);
  }
}
