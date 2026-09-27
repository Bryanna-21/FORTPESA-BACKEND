import { prisma } from '../../infrastructure/database/prisma.js';
import { getFortpesaProvider } from '../../providers/fortpesa/index.js';
import { PaymentService } from '../payments/payment.service.js';
import { AuditService } from '../../infrastructure/audit/audit.service.js';
import { AUDIT_ACTIONS } from '../../shared/constants/index.js';
import { acquireLock, releaseLock } from '../../infrastructure/queue/queue.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { loadEnv } from '../../infrastructure/configuration/env.js';
import { generateRequestId } from '../../shared/utilities/requestId.js';
import { ProviderError } from '../../shared/errors/index.js';

const log = logger.child({ module: 'reconciliation.worker' });
const RECONCILIATION_LOCK_KEY = 'reconciliation-run';
const RECONCILIATION_LOCK_TTL_MS = 5 * 60_000;

/**
 * Finds payments stuck in PENDING/PROCESSING beyond a safety window, asks
 * Fortpesa directly for their current status, and applies any settlement
 * through the same PaymentService.applySettlement path a webhook uses — so
 * the correction is idempotent, audited and ledgered identically regardless
 * of source. Safe to run repeatedly and concurrently: a Redis lock ensures
 * only one run executes at a time, and payments already terminal are
 * untouched.
 */
export async function runReconciliation(): Promise<{
  runId: string;
  paymentsChecked: number;
  mismatchesFound: number;
  corrected: number;
}> {
  const gotLock = await acquireLock(RECONCILIATION_LOCK_KEY, RECONCILIATION_LOCK_TTL_MS);
  if (!gotLock) {
    log.info('Reconciliation already running elsewhere; skipping this invocation.');
    throw new Error('Reconciliation is already in progress.');
  }

  const provider = getFortpesaProvider();
  const paymentService = new PaymentService(prisma, provider);
  const requestId = generateRequestId();

  const run = await prisma.reconciliationRun.create({ data: { status: 'RUNNING' } });

  await new AuditService(prisma).record({
    action: AUDIT_ACTIONS.RECONCILIATION_STARTED,
    actorType: 'SYSTEM',
    requestId,
    metadata: { runId: run.id },
  });

  let paymentsChecked = 0;
  let mismatchesFound = 0;
  let corrected = 0;

  try {
    const staleCutoff = new Date(Date.now() - 5 * 60_000);

    const stuckPayments = await prisma.payment.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        updatedAt: { lt: staleCutoff },
      },
      include: {
        providerTransactions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    for (const payment of stuckPayments) {
      paymentsChecked += 1;
      const latestProviderTransaction = payment.providerTransactions[0];

      if (!latestProviderTransaction) {
        // Never reached the provider (e.g. process crashed mid-initiation).
        // Leave it for the expiry sweep rather than guessing at a status.
        continue;
      }

      try {
        const status = await provider.getPaymentStatus({
          providerTransactionId: latestProviderTransaction.providerTransactionId,
        });

        if (status.status === 'PENDING') {
          continue;
        }

        mismatchesFound += 1;
        await paymentService.applySettlement({
          paymentId: payment.id,
          status: status.status,
          requestId,
          source: 'reconciliation',
          metadata: { providerTransactionId: latestProviderTransaction.providerTransactionId },
        });
        corrected += 1;
      } catch (err) {
        if (err instanceof ProviderError) {
          log.warn(
            { paymentId: payment.id, err: err.message },
            'Provider status lookup failed during reconciliation; will retry next run',
          );
          continue;
        }
        throw err;
      }
    }

    await expireStalePendingPayments(paymentService, requestId);

    await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        paymentsChecked,
        mismatchesFound,
        corrected,
        finishedAt: new Date(),
      },
    });

    await new AuditService(prisma).record({
      action: AUDIT_ACTIONS.RECONCILIATION_COMPLETED,
      actorType: 'SYSTEM',
      requestId,
      metadata: { runId: run.id, paymentsChecked, mismatchesFound, corrected },
    });

    return { runId: run.id, paymentsChecked, mismatchesFound, corrected };
  } catch (err) {
    await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        paymentsChecked,
        mismatchesFound,
        corrected,
        finishedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      },
    });
    throw err;
  } finally {
    await releaseLock(RECONCILIATION_LOCK_KEY);
  }
}

async function expireStalePendingPayments(
  paymentService: PaymentService,
  requestId: string,
): Promise<void> {
  const now = new Date();
  const expiredCandidates = await prisma.payment.findMany({
    where: { status: 'PENDING', expiresAt: { lt: now } },
    select: { id: true },
  });

  for (const candidate of expiredCandidates) {
    await paymentService.applySettlement({
      paymentId: candidate.id,
      status: 'EXPIRED',
      requestId,
      source: 'reconciliation',
    });
  }
}

/** Entry point when run as a standalone worker process (see package.json). */
async function main(): Promise<void> {
  const env = loadEnv();
  const intervalMs = 60_000;

  log.info({ env: env.NODE_ENV }, 'Reconciliation worker starting');

  // Run immediately, then on a fixed interval. A crash loop guard is
  // intentionally simple here — process supervision (Docker/systemd) is
  // expected to restart the process on exit.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const result = await runReconciliation();
      log.info(result, 'Reconciliation run completed');
    } catch (err) {
      log.error({ err }, 'Reconciliation run failed');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

const isDirectExecution =
  process.argv[1]?.endsWith('reconciliation.worker.ts') ||
  process.argv[1]?.endsWith('reconciliation.worker.js');

if (isDirectExecution) {
  main().catch((err) => {
    log.error({ err }, 'Reconciliation worker crashed');
    process.exit(1);
  });
}
