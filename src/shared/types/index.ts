export type PaymentStatus =
  | 'CREATED'
  | 'PROCESSING'
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED';

export type ApiKeyScope =
  | 'PAYMENTS_READ'
  | 'PAYMENTS_WRITE'
  | 'TRANSACTIONS_READ'
  | 'REFUNDS_WRITE'
  | 'ADMIN';

export interface AuthenticatedPrincipal {
  apiKeyId: string;
  merchantId: string | null;
  scopes: ApiKeyScope[];
  isAdmin: boolean;
}

export interface RequestContext {
  requestId: string;
  principal?: AuthenticatedPrincipal;
}

/**
 * Standard API envelope. Every route returns one of these two shapes so
 * clients can rely on a single parsing path.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  requestId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}
