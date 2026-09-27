# Troubleshooting

## A payment is stuck in PENDING

1. Check `GET /api/v1/admin/webhooks?paymentId=...` (filter client-side on
   the returned list, or query the `webhook_events` table directly) to see
   whether Fortpesa ever attempted delivery.
2. If no webhook arrived, trigger `POST /api/v1/admin/reconciliation`
   manually rather than waiting for the next scheduled run.
3. If reconciliation also finds nothing (the provider's own status lookup
   still reports pending), the payment is genuinely still awaiting the
   customer's PIN entry on their phone, or Fortpesa itself has not settled
   it yet.

## Webhook signature verification is failing for everything

This almost always means `FORTPESA_WEBHOOK_SIGNATURE_HEADER` or the
signature encoding assumption in `verifyHmacSha256` doesn't match what
Fortpesa actually sends — see the "Assumed" table in `docs/fortpesa.md`.
Capture one real raw webhook delivery (log the headers and body before
verification, temporarily) and compare against the assumption before
concluding the secret itself is wrong.

## `409 CONFLICT` on payment creation with a message about idempotency keys

The same `Idempotency-Key` header was reused with a different request body.
This is enforced deliberately — generate a new key per logical payment
attempt, not per merchant or per session.

## Reconciliation run returns `paymentsChecked: 0` but you know payments are stuck

Reconciliation only looks at payments whose `updatedAt` is more than five
minutes old (the staleness window in `reconciliation.worker.ts`), to avoid
racing a genuinely in-flight initiation. A payment stuck for under five
minutes is expected to not show up yet.

## `P2002` errors appearing in application logs

This is the expected signal of a race on a unique constraint — usually the
idempotency key or the provider transaction ID — being handled correctly.
`PaymentService.createPayment` catches this specific error code and resolves
it by returning the winning row; if you see it surfacing as an unhandled
500 instead, check that the catch block in `createPayment` still wraps the
exact `$transaction` call that can throw it.

## Amount mismatch on a webhook

Logged and stored on the `WebhookEvent` row as
`processingResult: "amount_mismatch"`, and the webhook is acknowledged with
`200` rather than left to retry indefinitely. Investigate via
`GET /api/v1/admin/webhooks` — this should never happen under normal
operation and likely indicates either a Fortpesa-side data issue or a
mismatch in the "Assumed" webhook payload shape documented in
`docs/fortpesa.md`.

## Local tests fail with "Invalid environment configuration"

Unit and integration tests load `test/setup/env.ts` (wired via
`vitest.config.ts`'s `setupFiles`) to populate safe defaults. If you've
added a new required environment variable to
`src/infrastructure/configuration/env.ts`, add a corresponding default to
`test/setup/env.ts` as well.
