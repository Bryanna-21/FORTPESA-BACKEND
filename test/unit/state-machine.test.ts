import { describe, expect, it } from 'vitest';
import {
  assertLegalTransition,
  isRetryable,
  isTerminal,
} from '../../src/modules/payments/payment.state-machine.js';
import { InvalidStateTransitionError } from '../../src/shared/errors/index.js';

describe('payment state machine', () => {
  it('allows CREATED -> PROCESSING -> PENDING -> SUCCEEDED', () => {
    expect(() => assertLegalTransition('CREATED', 'PROCESSING')).not.toThrow();
    expect(() => assertLegalTransition('PROCESSING', 'PENDING')).not.toThrow();
    expect(() => assertLegalTransition('PENDING', 'SUCCEEDED')).not.toThrow();
  });

  it('allows CREATED -> CANCELLED', () => {
    expect(() => assertLegalTransition('CREATED', 'CANCELLED')).not.toThrow();
  });

  it('allows PENDING -> FAILED and PENDING -> EXPIRED', () => {
    expect(() => assertLegalTransition('PENDING', 'FAILED')).not.toThrow();
    expect(() => assertLegalTransition('PENDING', 'EXPIRED')).not.toThrow();
  });

  it('allows retrying from FAILED and EXPIRED back into PROCESSING', () => {
    expect(() => assertLegalTransition('FAILED', 'PROCESSING')).not.toThrow();
    expect(() => assertLegalTransition('EXPIRED', 'PROCESSING')).not.toThrow();
  });

  it('rejects skipping states, e.g. CREATED -> SUCCEEDED', () => {
    expect(() => assertLegalTransition('CREATED', 'SUCCEEDED')).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('rejects any transition out of a terminal state', () => {
    expect(() => assertLegalTransition('SUCCEEDED', 'PROCESSING')).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => assertLegalTransition('CANCELLED', 'PROCESSING')).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('rejects re-entering the same state', () => {
    expect(() => assertLegalTransition('PENDING', 'PENDING')).toThrow(InvalidStateTransitionError);
  });

  it('correctly classifies terminal states', () => {
    expect(isTerminal('SUCCEEDED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('PENDING')).toBe(false);
  });

  it('correctly classifies retryable states', () => {
    expect(isRetryable('FAILED')).toBe(true);
    expect(isRetryable('EXPIRED')).toBe(true);
    expect(isRetryable('SUCCEEDED')).toBe(false);
    expect(isRetryable('PENDING')).toBe(false);
  });
});
