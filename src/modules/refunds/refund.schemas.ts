import { z } from 'zod';

export const createRefundSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().max(255).optional(),
});

export type CreateRefundInput = z.infer<typeof createRefundSchema>;
