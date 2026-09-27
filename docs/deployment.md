# Deployment

## Environments

Maintain three fully independent environments — development, staging,
production — each with its own database, Redis instance, Fortpesa
credentials (Fortpesa distinguishes sandbox/live keys via the `pb_live_`
prefix pattern shown on their site; confirm sandbox key format from your
dashboard), and webhook URL registered with Fortpesa. Never point a
non-production environment at production credentials.

## Local development

```bash
cp .env.example .env   # fill in real Fortpesa sandbox credentials
docker compose up -d postgres redis
npm install
npm run prisma:migrate
npm run dev             # API on :3000
npm run worker:dev       # reconciliation worker, separate process
```

## Container build

```bash
docker build -f docker/Dockerfile -t fortpesa-platform:latest .
```

The image is a multi-stage build: dependencies and TypeScript compilation
happen in a build stage; the runtime stage installs only production
dependencies, generates the Prisma client, and runs as a non-root user.

## Production checklist

1. `DATABASE_URL` points at a production Postgres instance with automated
   backups enabled.
2. `REDIS_URL` points at a production Redis instance (used for rate
   limiting and the reconciliation lock — losing it degrades rate limiting
   and could allow overlapping reconciliation runs, but does not corrupt
   payment data).
3. `FORTPESA_API_KEY` and `FORTPESA_WEBHOOK_SECRET` are the live
   credentials from the Fortpesa merchant dashboard, not sandbox values.
4. `API_KEY_PEPPER` is a unique, high-entropy value generated for this
   environment only (`openssl rand -hex 32`) and stored in your secrets
   manager, not in source control.
5. The webhook URL registered with Fortpesa points at
   `https://<your-domain>/api/v1/webhooks/fortpesa` over HTTPS.
6. `npm run prisma:migrate:deploy` has been run against the production
   database before the new API version starts serving traffic.
7. Both the API process and the reconciliation worker process are running
   under supervision (the Docker Compose `worker` service, or an equivalent
   in your orchestrator) — the API alone does not reconcile stuck payments.
8. `GET /ready` is wired into your load balancer's health check and `GET
   /health` into your uptime monitor.

## Scaling notes

The API is stateless and can run multiple replicas behind a load balancer;
rate limiting and the reconciliation lock are Redis-backed specifically so
this is safe. The reconciliation worker should run as exactly one active
instance at a time — the Redis lock makes running several instances safe
(only one will do work per cycle) but provides no benefit.
