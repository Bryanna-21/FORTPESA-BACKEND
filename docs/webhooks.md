# Webhooks

## Endpoint

```http
POST /api/v1/webhooks/fortpesa
```

No API key is required on this endpoint — it is authenticated by the
HMAC-SHA256 signature Fortpesa attaches instead (see `docs/fortpesa.md` for
which header carries it). It is rate-limited globally (300 req/min) rather
than per-merchant, since it isn't called with a merchant-scoped credential.

## Why the raw body matters

HMAC verification must run against the exact bytes Fortpesa signed. If the
body were parsed to JSON and re-serialized before verification, whitespace
or key-ordering differences could produce a body that no longer matches the
signature, causing either false rejections or, worse, a verification
implementation that stops actually checking anything meaningful.

`src/app.ts` special-cases the content-type parser for this one route so
the body reaches the controller as an untouched `Buffer`. Every other route
still gets normal JSON parsing.

## Processing pipeline

Implemented in `src/modules/webhooks/fortpesa.webhook.controller.ts`, in
this exact order:

1. Capture the raw body and headers.
2. Persist a `WebhookEvent` row immediately, before verification — so even a
   rejected or malformed delivery leaves an audit trail.
3. Verify the HMAC signature. Failure → mark the row rejected, record a
   `WEBHOOK_REJECTED` audit entry, return `400`.
4. Parse and structurally validate the payload.
5. Look up the referenced `ProviderTransaction` by its provider transaction
   ID. Unknown transaction → log, mark the row, acknowledge `200` anyway
   (retrying an event about a transaction we'll never recognize doesn't
   help either side).
6. Cross-check the amount in the webhook against the amount recorded when
   the payment was initiated. Mismatch → log, mark the row, acknowledge
   `200`, and leave it for manual investigation via
   `GET /api/v1/admin/webhooks` rather than trusting an unverified amount.
7. Apply the settlement via `PaymentService.applySettlement` — the same
   method the reconciliation worker calls, so a webhook-driven and a
   reconciliation-driven correction produce identical audit and ledger
   effects.
8. Mark the `WebhookEvent` row `applied` and acknowledge `200`.

## Idempotency and replay safety

Two independent layers protect against a webhook being processed twice:

- `WebhookEvent` has a unique constraint on `(providerName, providerEventId)`
  when Fortpesa supplies an event ID, so a byte-identical redelivery is
  rejected at the database level before it reaches business logic.
- Even without a usable event ID, `PaymentService.applySettlement` checks
  whether the payment is already in a terminal state
  (`isTerminal` in the state machine) and treats a settlement call against a
  terminal payment as a no-op — so five deliveries of the same "succeeded"
  event produce exactly one state transition, one ledger entry and one
  notification, never five.

## What happens if Fortpesa never sends a webhook

See `docs/reconciliation.md` — the reconciliation worker exists specifically
for this case and resolves it through the same `applySettlement` path.
