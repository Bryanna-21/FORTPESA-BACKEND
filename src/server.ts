import { buildApp } from './app.js';
import { loadEnv } from './infrastructure/configuration/env.js';
import { disconnectDatabase } from './infrastructure/database/prisma.js';
import { redis } from './infrastructure/queue/queue.js';
import { logger } from './infrastructure/logging/logger.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp();

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Fortpesa payment platform listening');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down gracefully');
    try {
      await app.close();
      await disconnectDatabase();
      redis.disconnect();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
