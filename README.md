# Fortpesa Payment Platform

**Developed and maintained by Exile Organization**
© 2026 Exile Organization. All rights reserved.

A standalone backend payment platform that lets an external frontend or
merchant application collect M-Pesa payments through Fortpesa
(fortpesa.co.ke), track their status, receive and verify webhook
confirmations, reconcile against Fortpesa when webhooks are lost, and
maintain an auditable financial ledger.

This is a backend service only. The frontend is a separate project and
consumes this API over HTTPS/JSON; it never receives Fortpesa credentials.

## Ownership

This payment platform is developed and maintained by **Exile Organization**.
See [`NOTICE.md`](NOTICE.md) for the project ownership and trademark notice.

## Why this exists

Fortpesa's public site documents one confirmed API example (STK push) and
describes several features (webhooks, transaction polling, a wallet
balance endpoint) without publishing a full reference. Rather than invent
the missing pieces, this codebase isolates every unconfirmed assumption
behind the provider adapter and documents it explicitly — see
[`docs/fortpesa.md`](docs/fortpesa.md), which should be the first thing
anyone reviews before processing real money through this platform.

## Quick start

```bash
cp .env.example .env        # fill in real Fortpesa sandbox credentials
docker compose up -d postgres redis
npm install
npm run prisma:migrate
npm run dev                  # API on http://localhost:3000
npm run worker:dev           # reconciliation worker (separate terminal)
```

Run the test suite:

```bash
npm run lint
npm run typecheck
npm test
```

## Repository structure

```text
src/
├── api/            # HTTP wiring: routes aggregator, middleware, response envelope
├── modules/        # One folder per domain concern (payments, webhooks, ledger, ...)
├── providers/      # Payment provider adapters (fortpesa/) behind a generic interface
├── infrastructure/ # Database, logging, security, queue, audit
├── shared/         # Errors, types, money/phone utilities, constants
├── app.ts          # Fastify application factory
└── server.ts       # Process entry point

prisma/schema.prisma # Full database schema
test/unit/           # Pure-logic unit tests
test/integration/    # PaymentService tests against an in-memory fake Prisma client
docs/                # Architecture, API, payments, fortpesa, webhooks, reconciliation,
                      # security, database, deployment, troubleshooting
docker/               # Dockerfile
docker-compose.yml    # Local Postgres + Redis + API + worker
openapi.yaml          # Machine-readable API reference
```

## Documentation index

- [`docs/architecture.md`](docs/architecture.md) — module boundaries and data flow
- [`docs/api.md`](docs/api.md) — endpoint reference, auth, idempotency, rate limits
- [`docs/payments.md`](docs/payments.md) — the payment state machine and retry rules
- [`docs/fortpesa.md`](docs/fortpesa.md) — **confirmed vs. assumed provider behavior**
- [`docs/webhooks.md`](docs/webhooks.md) — signature verification and processing pipeline
- [`docs/reconciliation.md`](docs/reconciliation.md) — recovering from lost webhooks
- [`docs/security.md`](docs/security.md) — API keys, authorization, secrets handling
- [`docs/database.md`](docs/database.md) — schema, money representation, concurrency
- [`docs/deployment.md`](docs/deployment.md) — environments, Docker, production checklist
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — common operational issues

## Known provider-specific assumptions requiring confirmation before go-live

See the "Assumed" table in [`docs/fortpesa.md`](docs/fortpesa.md). In short:
the status-lookup path, wallet-balance path, webhook signature header name,
and webhook payload schema are not published on Fortpesa's public site and
are implemented as overridable configuration with a documented default —
confirm each against the actual Fortpesa merchant dashboard API reference
before processing real transactions.

## Remaining configuration required for production

- Real `FORTPESA_API_KEY` and `FORTPESA_WEBHOOK_SECRET` from the Fortpesa
  merchant dashboard.
- A production `DATABASE_URL` and `REDIS_URL`.
- A freshly generated `API_KEY_PEPPER` and `SESSION_SECRET`
  (`openssl rand -hex 32`, generated independently for each).
- The webhook URL registered with Fortpesa pointed at this service's
  `/api/v1/webhooks/fortpesa` endpoint over HTTPS.

Full checklist: [`docs/deployment.md`](docs/deployment.md).

## Human dashboard auth vs. server-to-server API keys

This platform exposes two separate authentication paths — a person can
register/log in for a dashboard session (`/api/v1/auth/*`), and a merchant's
own backend integrates using a long-lived, scoped API key
(`/api/v1/merchant/api-keys/*` to self-serve one once logged in, or
issued directly by an administrator). The two tokens are verified by
different middleware and are never interchangeable — see
[`docs/security.md`](docs/security.md).

## Refunds

Fortpesa does not publish a refund API. `POST /api/v1/payments/:id/refunds`
records a refund request; an administrator confirms it actually happened via
`POST /api/v1/admin/refunds/:id/succeed`, which is the only point money
movement is reflected in the ledger. See `docs/security.md` for why this
wasn't automated end-to-end.
