# Reconciliation

## Why it exists

Webhooks can be lost, delayed, or never sent (network partition on either
side, Fortpesa outage, our own process restarting mid-delivery). Without a
reconciliation path, a payment that actually succeeded on Fortpesa's side
could sit in `PENDING` in our system forever, which is both a customer
support problem and a financial-integrity problem.

## What it does

`src/modules/reconciliation/reconciliation.worker.ts`, on each run:

1. Acquires a Redis lock (`reconciliation-run`) so only one run executes at
   a time, even if the worker is scaled to multiple instances.
2. Finds payments in `PENDING` or `PROCESSING` whose `updatedAt` is older
   than a 5-minute safety window (avoids racing an initiation that's still
   genuinely in flight).
3. For each, calls Fortpesa's status-lookup endpoint via the same
   `PaymentProvider` interface the payment engine uses.
4. If Fortpesa reports a settled status, applies it through
   `PaymentService.applySettlement` — identical to the webhook path.
5. Separately, sweeps `PENDING` payments whose `expiresAt` has passed and
   transitions them to `EXPIRED`.
6. Records a `ReconciliationRun` row (payments checked, mismatches found,
   corrections applied) and audit entries for the run's start and
   completion.

## Safety properties

- **Idempotent**: re-running reconciliation immediately after a successful
  run finds nothing to correct, because corrected payments are no longer
  `PENDING`/`PROCESSING`.
- **Concurrency-safe**: the Redis lock prevents two overlapping runs;
  `applySettlement`'s terminal-state check prevents a double-application
  even if the lock were somehow bypassed.
- **Never fabricates success**: if Fortpesa's status lookup itself fails or
  times out, that payment is simply skipped for this run and picked up on
  the next one — it is never assumed to have succeeded.

## Running it

- Automatically: the worker process (`npm run worker`, or the `worker`
  service in `docker-compose.yml`) runs a loop on a fixed interval.
- On demand: `POST /api/v1/admin/reconciliation` (admin-scoped) triggers one
  run synchronously and returns its result.

## Known limitation

The 5-minute staleness window and the fixed 60-second worker loop interval
are reasonable starting defaults, not values derived from Fortpesa's actual
STK timeout behavior (which isn't published — see `docs/fortpesa.md`). Tune
both once real settlement-time data is available.
