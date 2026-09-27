# API Reference

Full machine-readable reference: [`openapi.yaml`](../openapi.yaml).

## Authentication

Two independent authentication mechanisms exist, deliberately kept separate:

- **API keys** (`Authorization: Bearer <api-key>`) — for server-to-server
  calls: payment creation, transaction/receipt lookup, refunds, webhooks
  excepted. Issued per merchant, scoped, revocable.
- **Session tokens** (`Authorization: Bearer <session-token>`) — for a human
  signed into the merchant dashboard (`POST /api/v1/auth/login`). Used only
  by `/api/v1/auth/me` and the merchant self-service API key endpoints. A
  session token can never call the payments API, and an API key can never
  call the dashboard endpoints — see `docs/security.md`.

API keys are issued per merchant by an administrator
(`POST /api/v1/admin/merchants/:id/api-keys`) or by the merchant owner
themselves once logged in (`POST /api/v1/merchant/api-keys`), and carry one
or more scopes: `PAYMENTS_READ`, `PAYMENTS_WRITE`, `TRANSACTIONS_READ`,
`REFUNDS_WRITE`. Admin keys carry the `ADMIN` scope and bypass per-scope
checks.

## Idempotency

`POST /api/v1/payments` requires an `Idempotency-Key` header. Replaying the
same key with the same request body always returns the original payment;
replaying it with a different body returns `409 CONFLICT`.

```http
POST /api/v1/payments
Idempotency-Key: 3f29b6c1-...
```

## Response envelope

Success:

```json
{
  "success": true,
  "data": { "...": "..." },
  "requestId": "req_..."
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "PAYMENT_NOT_FOUND",
    "message": "Payment could not be found.",
    "requestId": "req_..."
  }
}
```

## Pagination

List endpoints accept `page` (default 1) and `pageSize` (default 25, max
100) query parameters and return:

```json
{ "items": [], "pagination": { "page": 1, "pageSize": 25, "total": 0 } }
```

## Rate limits

| Scope                       | Limit                 |
| ---------------------------- | ---------------------- |
| Default (all authenticated)  | 100 req/min/merchant   |
| `POST /payments`, `/retry`   | 30 req/min/merchant    |
| `POST /webhooks/fortpesa`    | 300 req/min (global)   |
| Admin endpoints               | 60 req/min             |

## Endpoints

| Method | Path                                    | Auth                    |
| ------ | ---------------------------------------- | ------------------------ |
| POST   | `/api/v1/auth/register`                  | none (rate-limited)       |
| POST   | `/api/v1/auth/login`                     | none (rate-limited)       |
| GET    | `/api/v1/auth/me`                        | session                   |
| GET    | `/api/v1/merchant/api-keys`              | session                   |
| POST   | `/api/v1/merchant/api-keys`              | session (owner only)      |
| POST   | `/api/v1/merchant/api-keys/:id/revoke`   | session                   |
| POST   | `/api/v1/payments`                       | API key: `PAYMENTS_WRITE` |
| GET    | `/api/v1/payments`                       | API key: `PAYMENTS_READ`  |
| GET    | `/api/v1/payments/:id`                   | API key: `PAYMENTS_READ`  |
| GET    | `/api/v1/payments/:id/status`            | API key: `PAYMENTS_READ`  |
| POST   | `/api/v1/payments/:id/retry`             | API key: `PAYMENTS_WRITE` |
| POST   | `/api/v1/payments/:id/cancel`            | API key: `PAYMENTS_WRITE` |
| POST   | `/api/v1/payments/:id/refunds`           | API key: `REFUNDS_WRITE`  |
| GET    | `/api/v1/refunds/:id`                    | API key: `PAYMENTS_READ`  |
| POST   | `/api/v1/webhooks/fortpesa`              | Fortpesa signature        |
| GET    | `/api/v1/transactions`                   | API key: `TRANSACTIONS_READ` |
| GET    | `/api/v1/transactions/:id`               | API key: `TRANSACTIONS_READ` |
| GET    | `/api/v1/receipts/:id`                   | API key: `PAYMENTS_READ`  |
| GET    | `/api/v1/wallet/balance`                 | API key: `PAYMENTS_READ`  |
| GET    | `/api/v1/admin/payments`                 | API key: `ADMIN`          |
| GET    | `/api/v1/admin/transactions`             | API key: `ADMIN`          |
| GET    | `/api/v1/admin/webhooks`                 | API key: `ADMIN`          |
| GET    | `/api/v1/admin/audit-logs`               | API key: `ADMIN`          |
| GET    | `/api/v1/admin/reports`                  | API key: `ADMIN`          |
| POST   | `/api/v1/admin/reconciliation`           | API key: `ADMIN`          |
| POST   | `/api/v1/admin/refunds/:id/succeed`      | API key: `ADMIN`          |
| POST   | `/api/v1/admin/refunds/:id/fail`         | API key: `ADMIN`          |
| POST   | `/api/v1/admin/merchants`                | API key: `ADMIN`          |
| POST   | `/api/v1/admin/merchants/:id/api-keys`   | API key: `ADMIN`          |
| POST   | `/api/v1/admin/api-keys/:id/revoke`      | API key: `ADMIN`          |
| GET    | `/health`                                 | none                      |
| GET    | `/ready`                                  | none                      |

## Error codes

| Code                          | HTTP | Meaning                                        |
| ------------------------------ | ---- | ----------------------------------------------- |
| `VALIDATION_ERROR`             | 400  | Request body/query failed validation            |
| `AUTHENTICATION_ERROR`         | 401  | Missing/invalid/revoked API key                 |
| `AUTHORIZATION_ERROR`          | 403  | Key lacks the required scope or resource        |
| `NOT_FOUND`                    | 404  | Resource does not exist or isn't yours          |
| `CONFLICT`                     | 409  | Idempotency conflict, illegal retry, etc.       |
| `INVALID_STATE_TRANSITION`     | 409  | Payment state machine rejected the transition   |
| `RATE_LIMITED`                 | 429  | Too many requests                               |
| `PROVIDER_ERROR`               | 502  | Fortpesa returned an error                      |
| `PROVIDER_TIMEOUT`             | 504  | Fortpesa did not respond in time                |
| `WEBHOOK_VERIFICATION_FAILED`  | 400  | Webhook signature/payload invalid               |
| `INTERNAL_ERROR`               | 500  | Unexpected failure; no internal detail leaked   |
