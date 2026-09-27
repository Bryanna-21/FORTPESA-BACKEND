import { z } from 'zod';

export const createPaymentSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3).default('KES'),
  phone: z.string().min(9).max(15),
  reference: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const listPaymentsQuerySchema = z.object({
  status: z
    .enum(['CREATED', 'PROCESSING', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED'])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

export const paymentIdParamSchema = z.object({
  id: z.string().uuid(),
});
