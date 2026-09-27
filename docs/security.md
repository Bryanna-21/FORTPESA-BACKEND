# Security

## Principle: every client is untrusted

The frontend never receives Fortpesa credentials, never determines payment
status by itself, and its idea of "success" is always re-confirmed by
reading `GET /api/v1/payments/:id/status` — which reflects only what our own
state machine and verified webhook/reconciliation data say. A frontend
"success" screen appearing is never treated as evidence of anything by the
backend.

## Two authentication mechanisms, kept strictly separate

- **API keys** — scrypt+pepper hashed, scoped, revocable (detailed below).
  Used for server-to-server integration: payment creation, transaction
  lookup, refunds.
- **Session tokens** — a lightweight HMAC-SHA256-signed token
  (`src/infrastructure/security/sessionToken.ts`) issued on
  `POST /api/v1/auth/login` or `/register`, used only by the dashboard-facing
  endpoints (`/api/v1/auth/me`, `/api/v1/merchant/api-keys/*`). It is not a
  JWT and doesn't claim to be — no algorithm field an attacker could
  downgrade, just a payload and one HMAC signature, verified in constant
  time. Session tokens carry a role and expiry and are checked by a
  completely separate middleware (`requireUserSession`) from API keys
  (`requireAuthentication`), so a leaked dashboard session can never be used
  to call the payments API, and a leaked API key can never sign into the
  dashboard.

## API keys

- Generated as `<prefix><random>.​<random-secret>` (`src/infrastructure/security/apiKey.ts`).
- Only a salted `scrypt` hash of the secret (with an additional
  server-side pepper, `API_KEY_PEPPER`) is ever stored — the plaintext key
  is shown to the merchant exactly once, at issuance.
- Verification uses `crypto.timingSafeEqual` to avoid timing side-channels.
- Keys carry explicit scopes (`PAYMENTS_READ`, `PAYMENTS_WRITE`,
  `TRANSACTIONS_READ`, `REFUNDS_WRITE`, `ADMIN`) and can be revoked
  (`revokedAt`) or have their last-used time inspected — never logged in
  plaintext (see the logger's `redact` configuration).

## Authorization

Every payment/transaction/receipt lookup checks `merchantId` ownership
before returning data (`getOwnedPayment` in `payment.service.ts`,
equivalent checks in `transaction.service.ts` and `receipt.service.ts`).
Changing the ID in the URL to another merchant's payment returns `404`, not
`403` — this avoids confirming that a given ID exists at all to a party who
shouldn't know.

## Webhook authentication

Covered in detail in `docs/webhooks.md`. Summary: HMAC-SHA256 over the raw
body, constant-time comparison, rejection logged and audited, no fallback to
"trust it anyway" under any condition.

## No unaudited state mutation

There is deliberately no endpoint resembling `POST /mark-payment-paid`. The
only ways a payment reaches `SUCCEEDED` are:

1. A verified Fortpesa webhook, or
2. The reconciliation worker's own verified status lookup against Fortpesa.

Both paths go through `PaymentService.applySettlement`, which writes a
`PaymentEvent`, an `AuditLog` entry and a `LedgerEntry` as part of the same
database transaction as the state change — there is no code path that
updates `Payment.status` without also writing that trail.

## Rate limiting

See `docs/api.md` for the current limits. Configured centrally in
`src/api/middleware/rateLimit.ts`, backed by Redis so limits hold across
multiple API instances.

## Secrets handling

- All credentials (`FORTPESA_API_KEY`, `FORTPESA_WEBHOOK_SECRET`,
  `API_KEY_PEPPER`, `DATABASE_URL`) are read from environment variables,
  validated at startup (`src/infrastructure/configuration/env.ts`), and
  never committed — `.env.example` contains names only.
- The structured logger redacts `authorization` headers and any field named
  `apiKey`, `hashedKey`, `password`, `passwordHash`, `fortpesaSecret` or
  `webhookSecret` at any nesting level.
- Error responses never include stack traces, raw database errors, or
  provider response bodies in production — see the global error handler in
  `src/api/middleware/errorHandler.ts`.

## Refunds are honestly scoped

Fortpesa's public developer page does not document a refund endpoint (only
STK push is confirmed — see `docs/fortpesa.md`). Rather than invent one,
`POST /api/v1/payments/:id/refunds` records a refund *request*
(`Refund.status = REQUESTED`) without calling anything against Fortpesa. An
administrator confirms completion — after actually processing it via
Fortpesa's dashboard, support channel, or a real refund API once one is
confirmed — via `POST /api/v1/admin/refunds/:id/succeed`, which is the only
point a `REFUND` ledger entry is written. This mirrors how a payment's
`PAYMENT` ledger entry is only written on confirmed settlement, never on
initiation.

## Things intentionally out of scope for this build

- End-user (customer) authentication — this platform is a merchant-facing
  payment backend, not a consumer identity system.
- PCI-scope card handling — card payments are listed by Fortpesa as a
  supported channel but are not implemented here; only M-Pesa STK is
  wired up, per the confirmed public API example (see `docs/fortpesa.md`).
