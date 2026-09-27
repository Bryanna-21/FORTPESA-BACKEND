import type { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  action: string;
  actorType: 'SYSTEM' | 'MERCHANT_API_KEY' | 'ADMIN_API_KEY' | 'USER';
  actorUserId?: string;
  paymentId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  constructor(private readonly db: DbClient) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.auditLog.create({
      data: {
        action: entry.action,
        actorType: entry.actorType,
        actorUserId: entry.actorUserId,
        paymentId: entry.paymentId,
        requestId: entry.requestId,
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
