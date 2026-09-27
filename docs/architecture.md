# Architecture

## Overview

This service is a modular monolith. It is not split into microservices
because nothing about payment volume or team size in this project currently
justifies that operational cost — see "Prefer a modular monolith" in the
build brief this repository was built against.

```text
EXTERNAL FRONTEND
       |
       | HTTPS / JSON
       v
FASTIFY HTTP LAYER (src/app.ts, src/api)
       |
       v
AUTHENTICATION (API key, src/modules/auth)
       |
       v
PAYMENT SERVICE (src/modules/payments)
       |
       +--------------------+
       |                    |
       v                    v
POSTGRESQL (Prisma)    REDIS (rate limits, locks)
       |                    |
       |                    +--> reconciliation worker
       |
       v
FORTPESA PROVIDER ADAPTER (src/providers/fortpesa)
       |
       | HTTPS
       v
FORTPESA
       |
       | signed webhook
       v
WEBHOOK CONTROLLER (src/modules/webhooks)
       |
       v
PAYMENT STATE MACHINE (src/modules/payments/payment.state-machine.ts)
       |
       v
LEDGER + AUDIT LOG (src/modules/ledger, src/infrastructure/audit)
```

## Module boundaries

- `src/api` — HTTP wiring only: route registration, the global error
  handler, rate limiting, the response envelope. No business logic.
- `src/modules/*` — one folder per bounded concern (payments, transactions,
  webhooks, ledger, reconciliation, notifications, receipts, admin,
  merchants, auth). Each module owns its own service, schema and routes.
- `src/providers/*` — payment provider adapters. `PaymentProvider.ts` is the
  interface the payment engine depends on; `fortpesa/` is the only
  implementation today. A second provider is added by writing a new adapter
  folder, not by touching `payments/payment.service.ts`.
- `src/infrastructure/*` — cross-cutting technical concerns: database
  client, logging, security primitives (API key hashing, HMAC verification),
  the Redis-backed queue/lock helpers, audit logging.
- `src/shared/*` — pure, dependency-free code: error types, money and phone
  utilities, shared constants and types.

## Why the payment engine never imports Fortpesa types directly

`payment.service.ts` depends only on `PaymentProvider`, `InitiatePaymentInput`,
`ProviderPaymentResult`, etc. — all provider-agnostic. Fortpesa-specific
field names, status strings and HTTP paths live entirely inside
`src/providers/fortpesa`. This is what makes "support future payment
providers without rewriting the core payment engine" (a stated requirement)
actually true rather than aspirational: adding M-Pesa via a different
aggregator, or a card processor, means implementing `PaymentProvider` again.

## Data flow: happy path

1. Frontend calls `POST /api/v1/payments` with an `Idempotency-Key` header.
2. `PaymentService.createPayment` validates amount/currency/phone, checks
   idempotency, creates the `Payment` row (`CREATED`), commits.
3. Still inside the same request, `initiateWithProvider` transitions the
   payment to `PROCESSING`, calls the Fortpesa adapter's `initiatePayment`,
   records the attempt and provider transaction, and transitions to
   `PENDING` (or `FAILED` if Fortpesa rejected the request outright).
4. The customer completes the M-Pesa STK prompt on their phone.
5. Fortpesa sends a signed webhook to `POST /api/v1/webhooks/fortpesa`.
6. The webhook controller verifies the signature, looks up the matching
   `ProviderTransaction`, cross-checks the amount, and calls
   `PaymentService.applySettlement`, which is the single code path both the
   webhook and the reconciliation worker use to move a payment to its final
   state, write the ledger entry, and queue a notification.

## Recovery path

If step 5 never happens (webhook lost, Fortpesa retried and failed, process
restarted mid-flight), the reconciliation worker (`src/modules/reconciliation`)
periodically finds payments stuck in `PENDING`/`PROCESSING` past a safety
window, asks Fortpesa directly for status via `getPaymentStatus`, and applies
the result through the same `applySettlement` path — so a reconciled payment
is audited and ledgered identically to one confirmed via webhook.
