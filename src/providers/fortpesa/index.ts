import { FortpesaProvider } from './client.js';
import type { PaymentProvider } from '../PaymentProvider.js';

let instance: PaymentProvider | undefined;

export function getFortpesaProvider(): PaymentProvider {
  if (!instance) {
    instance = new FortpesaProvider();
  }
  return instance;
}

export { FortpesaProvider } from './client.js';
export * from './types.js';
export * from './errors.js';
