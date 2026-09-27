import type { PaymentStatus } from '../../shared/types/index.js';
import { InvalidStateTransitionError } from '../../shared/errors/index.js';

const LEGAL_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  CREATED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PENDING', 'FAILED', 'CANCELLED'],
  PENDING: ['SUCCEEDED', 'FAILED', 'EXPIRED'],
  SUCCEEDED: [],
  FAILED: ['PROCESSING'],
  EXPIRED: ['PROCESSING'],
  CANCELLED: [],
};

export function isTerminal(status: PaymentStatus): boolean {
  return LEGAL_TRANSITIONS[status].length === 0;
}

export function isRetryable(status: PaymentStatus): boolean {
  return status === 'FAILED' || status === 'EXPIRED';
}

export function assertLegalTransition(from: PaymentStatus, to: PaymentStatus): void {
  const allowed = LEGAL_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new InvalidStateTransitionError(
      `Cannot transition payment from ${from} to ${to}.`,
      { from, to, allowed },
    );
  }
}
