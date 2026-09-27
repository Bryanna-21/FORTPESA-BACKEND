# Fortpesa Integration

This is the single most important document in this repository to review
before taking real payments. It exists because Fortpesa (fortpesa.co.ke)
does not publish a full API reference on its public marketing site — only a
developer-facing snippet and a set of feature descriptions. Everything below
is separated into what was directly observed and what had to be assumed.

**Before going live: log into the Fortpesa merchant dashboard, open its
actual API reference under Developer APIs, and confirm every item in the
"Assumed" table. Correct any mismatch in `src/providers/fortpesa/config.ts`,
`types.ts` and `.env` — those are the only files that should need to
change.**

## Confirmed (taken verbatim from fortpesa.co.ke's public developer page)

| Item                     | Value                                                              |
| ------------------------- | ------------------------------------------------------------------- |
| STK push endpoint         | `POST {base_url}/api/v1/payments/stk`                              |
| Authentication            | `Authorization: Bearer pb_live_<key>`                                |
| Request body              | `{ "amount": 15000, "phone": "0712345678", "account_reference": "INV-2041" }` |
| Amount units               | Minor units (the example `15000` corresponds to a displayed amount an order of magnitude smaller — treat as integer minor units) |
| Phone format in requests  | Local format (`0712345678`), not E.164                              |
| Success response           | `201 Created`, `{"data": {"uuid": "...", "status": "pending", "platform_fee": 600}}` |
| Webhook signing            | HMAC-SHA256, for success, failure, and expiry events                 |
| Transaction polling        | "Poll any payment by UUID until it settles" (status lookup exists, by UUID) |
| Wallet balance              | A wallet balance endpoint exists, readable "with any API key"       |
| Also-supported channels    | Paybill, Till (Buy Goods), bank transfer, card — STK is the channel this adapter implements |

## Assumed (not published; isolated as overridable configuration)

| Item                              | Default used here                     | Where to fix if wrong                          |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Status-lookup path                 | `GET /api/v1/payments/{uuid}`           | `FORTPESA_STATUS_PATH_TEMPLATE` env var           |
| Status-lookup response shape        | Same `{data: {uuid, status, ...}}` envelope as STK | `src/providers/fortpesa/types.ts` (`FortpesaStatusResponse`) |
| Wallet balance path                 | `GET /api/v1/wallet/balance`             | `FORTPESA_WALLET_BALANCE_PATH` env var            |
| Webhook signature header name       | `X-Fortpesa-Signature`                   | `FORTPESA_WEBHOOK_SIGNATURE_HEADER` env var       |
| Webhook signature encoding          | Lowercase hex digest (optionally `sha256=`-prefixed) | `verifyHmacSha256` in `src/infrastructure/security/hmac.ts` |
| Webhook payload shape                | `{event, event_id, data: {uuid, status, amount, currency, reference}}` | `src/providers/fortpesa/types.ts` (`FortpesaWebhookPayload`) and `mapper.ts` |
| Settled/failed status string values  | `success`/`succeeded`/`completed` → SUCCEEDED; `failed`/`cancelled`/`declined` → FAILED; anything else → PENDING | `mapRawStatusToSettled` in `mapper.ts` |
| Error response shape                 | `{error: {code, message}}` or `{message}` | `FortpesaErrorResponse` in `types.ts`             |

None of these assumptions were invented to look plausible and left
undocumented — each is a named constant or a single well-commented function,
specifically so a mismatch against the real API surfaces as one focused code
change rather than a hunt through the payment engine.

## Why the adapter converts phone numbers both ways

The rest of this codebase treats `254712345678` (254-prefixed, no plus) as
the canonical phone format — see `docs/payments.md` and
`src/shared/utilities/phone.ts`. Fortpesa's confirmed example sends the
local format (`0712345678`). The conversion happens once, at the adapter
boundary (`toFortpesaPhoneFormat` in `mapper.ts`), so the canonical format
convention holds everywhere else in the system.

## What "platform_fee" means here

The confirmed STK response includes `platform_fee` (`600` in the example).
This is recorded as a `FEE`-type `LedgerEntry` at initiation time, separate
from the `PAYMENT`-type entry recorded on settlement — see
`docs/database.md` for how the ledger distinguishes these.

## Verifying against a live payload before cutover

Before processing real transactions:

1. Send a small real STK push through the sandbox/live API and confirm the
   response matches `FortpesaStkResponse` exactly.
2. Trigger a real webhook delivery (a small real payment is the most
   reliable way) and capture the raw request Fortpesa sends — headers and
   body — to confirm the signature header name and payload shape against
   the "Assumed" table above.
3. Call the status-lookup endpoint for a known transaction UUID and confirm
   the response shape.

If any of these differ from what's assumed here, update the corresponding
row's file — never patch around a mismatch inside `payment.service.ts`,
which must stay provider-agnostic.
