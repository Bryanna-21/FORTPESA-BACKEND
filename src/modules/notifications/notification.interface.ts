export interface NotificationPayload {
  merchantId?: string;
  paymentId?: string;
  event: string;
  data: Record<string, unknown>;
}

export interface NotificationChannel {
  readonly name: 'SMS' | 'EMAIL' | 'PUSH' | 'WEBHOOK';
  send(payload: NotificationPayload): Promise<void>;
}
