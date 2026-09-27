import type { FastifyReply, FastifyRequest } from 'fastify';
import { getFortpesaProvider } from '../../providers/fortpesa/index.js';
import { PaymentService } from '../payments/payment.service.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { AuditService } from '../../infrastructure/audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../shared/constants/index.js';
import { WebhookVerificationError } from '../../shared/errors/index.js';
import { isUniqueConstraintViolation } from '../../infrastructure/database/prismaErrors.js';

const provider = getFortpesaProvider();
const paymentService = new PaymentService(prisma, provider);
const log = logger.child({ module: 'webhooks.fortpesa' });

/**
 * Pipeline, matching the required processing order exactly:
 *   receive -> capture raw body -> verify signature -> validate payload ->
 *   identify transaction -> verify transaction -> deduplicate ->
 *   apply transition -> ledger -> audit -> notify -> acknowledge.
 *
 * The raw body must reach this handler unparsed and unmodified for the HMAC
 * check to be meaningful — see app.ts, where the JSON body parser is
 * disabled specifically for this route.
 */
export async function handleFortpesaWebhook(req: FastifyRequest, reply: FastifyReply) {
  const rawBody = (req.body as Buffer | string).toString('utf8');
  const headers = req.headers as Record<string, string | string[] | undefined>;

  const webhookEventDraft = await prisma.webhookEvent.create({
    data: {
      providerName: 'fortpesa',
      rawBody,
      headers: headers as never,
      signatureValid: false,
    },
  });

  await new AuditService(prisma).record({
    action: AUDIT_ACTIONS.WEBHOOK_RECEIVED,
    actorType: 'SYSTEM',
    requestId: req.id,
    metadata: { webhookEventId: webhookEventDraft.id },
  });

  let verifiedEvent;
  try {
    verifiedEvent = provider.verifyWebhook({ rawBody, headers });
  } catch (err) {
    await prisma.webhookEvent.update({
      where: { id: webhookEventDraft.id },
      data: { processingResult: 'signature_rejected', processedAt: new Date() },
    });

    await new AuditService(prisma).record({
      action: AUDIT_ACTIONS.WEBHOOK_REJECTED,
      actorType: 'SYSTEM',
      requestId: req.id,
      metadata: { reason: err instanceof Error ? err.message : 'unknown' },
    });

    log.warn({ err }, 'Rejected Fortpesa webhook: signature verification failed');
    if (err instanceof WebhookVerificationError) {
      return reply.code(400).send({
        success: false,
        error: { code: err.code, message: err.message, requestId: req.id },
      });
    }
    throw err;
  }

  await prisma.webhookEvent
    .update({
      where: { id: webhookEventDraft.id },
      data: { signatureValid: true, providerEventId: verifiedEvent.providerEventId },
    })
    .catch((err: unknown) => {
      // A concurrent delivery of the same (providerName, providerEventId)
      // pair can race this update into a unique-constraint violation. That
      // race is harmless: the concurrent delivery's own request will carry
      // this event through applySettlement, which is idempotent against a
      // terminal payment regardless of which delivery gets there first. We
      // still surface anything other than a unique violation.
      if (!isUniqueConstraintViolation(err)) throw err;
    });

  await new AuditService(prisma).record({
    action: AUDIT_ACTIONS.WEBHOOK_VERIFIED,
    actorType: 'SYSTEM',
    requestId: req.id,
    metadata: { providerTransactionId: verifiedEvent.providerTransactionId },
  });

  // Deduplicate: a (providerName, providerEventId) unique constraint on
  // WebhookEvent already prevented a duplicate row above if the provider
  // supplies an event id. Belt-and-braces: also check whether this provider
  // transaction has already reached a terminal payment state.
  const providerTransaction = await prisma.providerTransaction.findUnique({
    where: { providerTransactionId: verifiedEvent.providerTransactionId },
  });

  if (!providerTransaction) {
    log.warn(
      { providerTransactionId: verifiedEvent.providerTransactionId },
      'Webhook refers to an unknown provider transaction',
    );
    await prisma.webhookEvent.update({
      where: { id: webhookEventDraft.id },
      data: { processingResult: 'unknown_transaction', processedAt: new Date() },
    });
    // Acknowledge with 200 regardless — an unknown transaction is not the
    // provider's problem to retry indefinitely, and we have a full audit
    // trail to investigate manually.
    return reply.code(200).send({ success: true, data: { received: true }, requestId: req.id });
  }

  // Verify the amount matches what we expect before trusting the event.
  if (verifiedEvent.amountMinor !== providerTransaction.amountMinor) {
    log.error(
      {
        providerTransactionId: verifiedEvent.providerTransactionId,
        expected: providerTransaction.amountMinor,
        received: verifiedEvent.amountMinor,
      },
      'Webhook amount does not match the recorded provider transaction amount',
    );
    await prisma.webhookEvent.update({
      where: { id: webhookEventDraft.id },
      data: {
        processingResult: 'amount_mismatch',
        processedAt: new Date(),
        paymentId: providerTransaction.paymentId,
      },
    });
    return reply.code(200).send({ success: true, data: { received: true }, requestId: req.id });
  }

  await paymentService.applySettlement({
    paymentId: providerTransaction.paymentId,
    status: verifiedEvent.status,
    requestId: req.id,
    source: 'webhook',
    metadata: { providerTransactionId: verifiedEvent.providerTransactionId },
  });

  await prisma.webhookEvent.update({
    where: { id: webhookEventDraft.id },
    data: {
      processingResult: 'applied',
      processedAt: new Date(),
      paymentId: providerTransaction.paymentId,
    },
  });

  return reply.code(200).send({ success: true, data: { received: true }, requestId: req.id });
}
