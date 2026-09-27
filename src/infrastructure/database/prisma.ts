import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../configuration/env.js';

const env = loadEnv();

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
