import type { NotificationChannel, NotificationPayload } from './notification.interface.js';
import { logger } from '../../infrastructure/logging/logger.js';

const log = logger.child({ module: 'notifications.log-channel' });

/**
 * No SMS/email/webhook provider has been wired up for this project yet.
 * Rather than fabricate a fake integration, notification delivery starts as
 * a structured-log channel that still satisfies the notification
 * abstraction and is recorded under the closest existing
 * NotificationChannel enum value (WEBHOOK) until a real outbound channel is
 * configured. Swapping in a real SMS, email or webhook-delivery provider
 * means adding a new NotificationChannel implementation, not changing any
 * call site — see NotificationService's constructor.
 */
export class LogNotificationChannel implements NotificationChannel {
  readonly name = 'WEBHOOK' as const;

  async send(payload: NotificationPayload): Promise<void> {
    log.info({ payload }, 'Notification event recorded');
    await Promise.resolve();
  }
}
