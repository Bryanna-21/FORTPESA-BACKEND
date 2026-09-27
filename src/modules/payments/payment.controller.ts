import type { FastifyReply, FastifyRequest } from 'fastify';
import { PaymentService } from './payment.service.js';
import { createPaymentSchema, listPaymentsQuerySchema, paymentIdParamSchema } from './payment.schemas.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { getFortpesaProvider } from '../../providers/fortpesa/index.js';
import { AuthenticationError, ValidationError } from '../../shared/errors/index.js';
import { sendSuccess } from '../../api/response.js';

const paymentService = new PaymentService(prisma, getFortpesaProvider());

function requireMerchant(req: FastifyRequest): string {
  const merchantId = req.principal?.merchantId;
  if (!merchantId) {
    throw new AuthenticationError('This endpoint requires a merchant-scoped API key.');
  }
  return merchantId;
}

function requireIdempotencyKey(req: FastifyRequest): string {
  const header = req.headers['idempotency-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (!key) {
    throw new ValidationError('The Idempotency-Key header is required for this operation.');
  }
  return key;
}

export async function createPaymentHandler(req: FastifyRequest, reply: FastifyReply) {
  const merchantId = requireMerchant(req);
  const idempotencyKey = requireIdempotencyKey(req);
  const input = createPaymentSchema.parse(req.body);

  const payment = await paymentService.createPayment(input, {
    merchantId,
    idempotencyKey,
    requestId: req.id,
  });

  return sendSuccess(reply, 201, req.id, {
    paymentId: payment.id,
    status: payment.status,
    amount: payment.amountMinor,
    currency: payment.currency,
    reference: payment.reference,
    createdAt: payment.createdAt,
  });
}

export async function listPaymentsHandler(req: FastifyRequest, reply: FastifyReply) {
  const merchantId = requireMerchant(req);
  const query = listPaymentsQuerySchema.parse(req.query);
  const result = await paymentService.listPayments(merchantId, query);

  return sendSuccess(reply, 200, req.id, {
    items: result.items.map(toPaymentDto),
    pagination: { page: result.page, pageSize: result.pageSize, total: result.total },
  });
}

export async function getPaymentHandler(req: FastifyRequest, reply: FastifyReply) {
  const merchantId = requireMerchant(req);
  const { id } = paymentIdParamSchema.parse(req.params);
  const payment = await paymentService.getOwnedPayment(id, merchantId);

  return sendSuccess(reply, 200, req.id, toPaymentDto(payment));
}

export async function getPaymentStatusHandler(req: FastifyRequest, reply: FastifyReply) {
  const merchantId = requireMerchant(req);
  const { id } = paymentIdParamSchema.parse(req.params);
  const payment = await paymentService.getOwnedPayment(id, merchantId);

  return sendSuccess(reply, 200, req.id, { paymentId: payment.id, status: payment.status });
}

export async function retryPaymentHandler(req: FastifyRequest, reply: FastifyReply) {
  const merchantId = requireMerchant(req);
  const { id } = paymentIdParamSchema.parse(req.params);
  const payment = await paymentService.retryPayment(id, merchantId, req.id);

  return sendSuccess(reply, 200, req.id, toPaymentDto(payment));
}

export async function cancelPaymentHandler(req: FastifyRequest, reply: FastifyReply) {
  const merchantId = requireMerchant(req);
  const { id } = paymentIdParamSchema.parse(req.params);
  const payment = await paymentService.cancelPayment(id, merchantId, req.id);

  return sendSuccess(reply, 200, req.id, toPaymentDto(payment));
}

function toPaymentDto(payment: {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
  reference: string;
  phoneNormalized: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    paymentId: payment.id,
    status: payment.status,
    amount: payment.amountMinor,
    currency: payment.currency,
    reference: payment.reference,
    phone: payment.phoneNormalized,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}
