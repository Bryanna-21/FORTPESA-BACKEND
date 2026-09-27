import { Redis } from 'ioredis';
import { loadEnv } from '../configuration/env.js';
import { logger } from '../logging/logger.js';

const env = loadEnv();

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('error', (err: Error) => {
  logger.error({ err }, 'Redis connection error');
});

export type QueueName = 'reconciliation' | 'retries' | 'notifications';

/**
 * Minimal Redis-list-backed job queue. This intentionally avoids pulling in
 * a full queue framework (BullMQ, etc.) until the platform's throughput
 * requires it — the interface below is the seam to swap in a heavier queue
 * without touching call sites.
 */
export async function enqueueJob(
  queue: QueueName,
  payload: Record<string, unknown>,
): Promise<void> {
  await redis.lpush(`queue:${queue}`, JSON.stringify(payload));
}

export async function dequeueJob<T>(queue: QueueName, timeoutSeconds = 5): Promise<T | null> {
  const result = await redis.brpop(`queue:${queue}`, timeoutSeconds);
  if (!result) return null;
  const [, raw] = result;
  return JSON.parse(raw) as T;
}

export async function acquireLock(key: string, ttlMs: number): Promise<boolean> {
  const result = await redis.set(`lock:${key}`, '1', 'PX', ttlMs, 'NX');
  return result === 'OK';
}

export async function releaseLock(key: string): Promise<void> {
  await redis.del(`lock:${key}`);
}
