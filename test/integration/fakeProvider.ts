import { randomUUID } from 'node:crypto';
import type {
  GetPaymentStatusInput,
  InitiatePaymentInput,
  PaymentProvider,
  ProviderPaymentResult,
  ProviderPaymentStatus,
  VerifiedWebhookEvent,
  VerifyWebhookInput,
} from '../../src/providers/PaymentProvider.js';

export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  public initiateCallCount = 0;
  public shouldFailInitiation = false;

  async initiatePayment(input: InitiatePaymentInput): Promise<ProviderPaymentResult> {
    this.initiateCallCount += 1;
    if (this.shouldFailInitiation) {
      return {
        providerTransactionId: `fake-${randomUUID()}`,
        status: 'FAILED',
        rawStatus: 'rejected',
        raw: { input },
      };
    }
    return {
      providerTransactionId: `fake-${randomUUID()}`,
      status: 'PENDING',
      rawStatus: 'pending',
      platformFeeMinor: 50,
      raw: { input },
    };
  }

  async getPaymentStatus(_input: GetPaymentStatusInput): Promise<ProviderPaymentStatus> {
    throw new Error('Not used in these tests');
  }

  verifyWebhook(_input: VerifyWebhookInput): VerifiedWebhookEvent {
    throw new Error('Not used in these tests');
  }
}
