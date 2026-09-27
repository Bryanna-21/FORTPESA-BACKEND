import type { Prisma, PrismaClient } from '@prisma/client';
import type { NotificationChannel, NotificationPayload } from './notification.interface.js';
import { LogNotificationChannel } from './log.channel.js';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Notifications are informational only. The payment state stored in the
 * database is always the source of truth — a failed or delayed notification
 * must never be interpreted as a payment outcome.
 */
export class NotificationService {
  private readonly channel: NotificationChannel;

  constructor(
    private readonly db: DbClient,
    channel: NotificationChannel = new LogNotificationChannel(),
  ) {
    this.channel = channel;
  }

  async notify(payload: NotificationPayload): Promise<void> {
    const record = await this.db.notification.create({
      data: {
        merchantId: payload.merchantId,
        paymentId: payload.paymentId,
        channel: this.channel.name,
        status: 'QUEUED',
        payload: payload.data as Prisma.InputJsonValue,
      },
    });

    try {
      await this.channel.send(payload);
      await this.db.notification.update({
        where: { id: record.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (err) {
      await this.db.notification.update({
        where: { id: record.id },
        data: { status: 'FAILED', error: err instanceof Error ? err.message : 'Unknown error' },
      });
    }
  }
}
