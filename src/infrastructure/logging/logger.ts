import pino from 'pino';
import { loadEnv } from '../configuration/env.js';

const env = loadEnv();

const REDACT_PATHS = [
  'req.headers.authorization',
  'headers.authorization',
  '*.apiKey',
  '*.hashedKey',
  '*.password',
  '*.passwordHash',
  '*.fortpesaSecret',
  '*.webhookSecret',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
  base: { service: 'fortpesa-payment-platform' },
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
