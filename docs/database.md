# Database

PostgreSQL via Prisma. Full schema: [`prisma/schema.prisma`](../prisma/schema.prisma).

## Money

Every monetary column is an `Int` representing minor units (e.g. KES
cents). There is no `Float` or unconstrained `Decimal` anywhere in the
schema. Arithmetic on these values in application code always goes through
`src/shared/utilities/money.ts`.

## Key tables

| Table                  | Purpose                                                          |
| ------------------------ | ------------------------------------------------------------------ |
| `merchants`             | Onboarded businesses collecting payments                          |
| `api_keys` (`ApiKey`)   | Hashed, scoped credentials, revocable                              |
| `payment_orders`        | Authoritative order/amount when an upstream order system exists   |
| `payments`              | The core payment record and state machine subject                 |
| `payment_attempts`      | One row per provider attempt; never overwritten                   |
| `provider_transactions` | Fortpesa's view of a transaction, linked to but never replacing our own ID |
| `payment_events`        | Every state transition, append-only                                |
| `webhook_events`        | Every inbound webhook delivery, verified or not                    |
| `ledger_entries`        | Append-only financial ledger (`PAYMENT`, `FEE`, `REFUND`, `ADJUSTMENT`) |
| `refunds`               | Refund requests and their lifecycle                                 |
| `notifications`         | Outbound notification attempts (informational, not authoritative)  |
| `audit_logs`            | Actor + action + metadata for every meaningful state change        |
| `idempotency_keys`      | Enforces exactly-once payment creation per key                      |
| `reconciliation_runs`   | One row per reconciliation pass                                     |

## Why `ProviderTransaction.providerTransactionId` is not our primary key

Our `Payment.id` is generated locally and exists before Fortpesa is ever
contacted (a payment can reach `FAILED` without a provider transaction
existing at all, e.g. a network timeout on the initiation call). Making the
provider's ID primary would make that state unrepresentable.

## Immutability

`LedgerEntry`, `PaymentEvent`, `AuditLog` and `WebhookEvent` rows are never
updated after creation by application code (the schema does not forbid it at
the database level, but no service method exposes an update path). A
correction to a ledger mistake is a new `ADJUSTMENT` row referencing the
same payment — see `LedgerService.recordAdjustment`.

## Concurrency: how idempotency actually holds under load

`IdempotencyKey` has a unique constraint on `(scope, key)`. Two concurrent
requests with the same key both attempt an `INSERT`; Postgres serializes
this at the index level — the second `INSERT` blocks until the first
transaction commits or rolls back, then fails with a unique violation
(`P2002`), at which point the losing request already sees the winning
transaction's committed `Payment` row when it looks it up. This is the
mechanism `test/integration/payments.test.ts` describes in comments but
cannot fully exercise without a live Postgres instance — the in-memory fake
used there proves the exactly-once *outcome*; the locking behavior itself is
Postgres's, not application code's, to get right, and is exercised by the
`integration` CI stage against a real database.

## Migrations

```bash
npm run prisma:migrate        # create + apply a new migration locally
npm run prisma:migrate:deploy # apply pending migrations in CI/production
```
