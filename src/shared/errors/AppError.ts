/**
 * Base class for all errors that are safe to translate into an API response.
 * Anything thrown that is not an AppError is treated as an unexpected
 * failure and reported to the client as a generic 500 with no internal
 * details attached.
 */
export abstract class AppError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  readonly httpStatus = 400;
  readonly code = 'VALIDATION_ERROR';
}

export class AuthenticationError extends AppError {
  readonly httpStatus = 401;
  readonly code = 'AUTHENTICATION_ERROR';
}

export class AuthorizationError extends AppError {
  readonly httpStatus = 403;
  readonly code = 'AUTHORIZATION_ERROR';
}

export class NotFoundError extends AppError {
  readonly httpStatus = 404;
  readonly code = 'NOT_FOUND';
}

export class ConflictError extends AppError {
  readonly httpStatus = 409;
  readonly code = 'CONFLICT';
}

export class RateLimitedError extends AppError {
  readonly httpStatus = 429;
  readonly code = 'RATE_LIMITED';
}

export class InvalidStateTransitionError extends AppError {
  readonly httpStatus = 409;
  readonly code = 'INVALID_STATE_TRANSITION';
}

export class ProviderError extends AppError {
  readonly httpStatus: number = 502;
  readonly code: string = 'PROVIDER_ERROR';

  constructor(
    message: string,
    public readonly providerName: string,
    public readonly retryable: boolean,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

export class ProviderTimeoutError extends ProviderError {
  override readonly httpStatus = 504;
  override readonly code = 'PROVIDER_TIMEOUT';

  constructor(providerName: string, details?: Record<string, unknown>) {
    super(`${providerName} did not respond within the configured timeout.`, providerName, true, details);
  }
}

export class WebhookVerificationError extends AppError {
  readonly httpStatus = 400;
  readonly code = 'WEBHOOK_VERIFICATION_FAILED';
}

export class InternalError extends AppError {
  readonly httpStatus = 500;
  readonly code = 'INTERNAL_ERROR';
}
