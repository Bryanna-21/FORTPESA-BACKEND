# Payments

## State machine

```text
CREATED ----------> PROCESSING ----------> PENDING
   |                    |                     |  \
   v                    v                     |   \
CANCELLED            CANCELLED                |    v
                         |                     |  SUCCEEDED (terminal)
                         v                     v
                       FAILED <----------  FAILED
                         |                     |
                         v                     v
                    PROCESSING (retry)      EXPIRED
                                                |
                                                v
                                          PROCESSING (retry)
```

Enforced in `src/modules/payments/payment.state-machine.ts`. Every
transition is validated against this table before being written; an illegal
transition throws `InvalidStateTransitionError` (`409`) rather than silently
succeeding.

- **CREATED** — the payment row exists; the provider has not yet been
  contacted. Reachable in the API surface only transiently, since creation
  immediately proceeds to initiation in the same request.
- **PROCESSING** — the provider call is in flight.
- **PENDING** — Fortpesa accepted the STK push; the customer is being
  prompted for their M-Pesa PIN. This is where a payment sits until a
  webhook or reconciliation resolves it.
- **SUCCEEDED / FAILED / CANCELLED** — terminal. `SUCCEEDED` and `CANCELLED`
  never transition further. `FAILED` and `EXPIRED` may be retried, which
  re-enters `PROCESSING` with a new attempt.

## Idempotency

Every `POST /api/v1/payments` call must carry an `Idempotency-Key` header.
The key, scoped to `payment.create`, is enforced unique at the database
level (`IdempotencyKey.scope_key` unique constraint). The request body is
hashed and stored alongside the key:

- Same key + same body → the original payment is returned, no new provider
  call is made.
- Same key + different body → `409 CONFLICT`, since silently accepting the
  new body would be indistinguishable from a bug swallowing the client's
  intent.
- Concurrent identical requests racing the unique constraint: the losing
  insert catches `P2002`, looks up the winning row, and returns its payment.

## Retries

A payment is retryable only from `FAILED` or `EXPIRED`
(`isRetryable` in the state machine). Retrying:

1. Confirms the payment belongs to the requesting merchant.
2. Confirms `MAX_PAYMENT_RETRY_ATTEMPTS` has not been reached.
3. Creates a new `PaymentAttempt` row — the previous attempt's history is
   never overwritten — and calls the provider again.

## Amount authority

The amount in the create-payment request is the amount charged. Where this
platform is deployed behind an order system that owns the authoritative
price, wire that system's price lookup into `PaymentService.createPayment`
before trusting `input.amount` — the current implementation assumes the
caller (the merchant's own backend, not an end customer's browser) is
already a trusted party. Never take payment amount from a request
originating in an untrusted browser context without that server-side check.

## Expiry

Payments carry an `expiresAt` set at creation
(`PAYMENT_EXPIRY_MINUTES`, default 15). The reconciliation worker sweeps
`PENDING` payments past their `expiresAt` and transitions them to `EXPIRED`,
from which they become retryable.
