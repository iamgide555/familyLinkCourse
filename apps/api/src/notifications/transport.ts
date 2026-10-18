import type { Id } from '../../../../packages/contracts/src/core.js';

export type NotificationItem = { memberId: Id; sessionId: Id | null; registrationId: Id | null };
export type ResolvedRecipient = { lineUserId: string | null; email: string | null; displayName: string };
export type DeliveryInput = {
  notificationId: Id;
  /** Stable per record: the same value is sent on every retry so providers can drop duplicates. */
  dedupeKey: string;
  recipient: ResolvedRecipient;
  template: string;
  subject: string;
  text: string;
  items: NotificationItem[];
};
export type DeliveryResult =
  | { kind: 'sent'; providerId: string | null }
  | { kind: 'retryable'; code: string }
  | { kind: 'unavailable' | 'permanent_failure'; code: string };
export abstract class Transport {
  abstract readonly channel: 'line' | 'email';
  abstract send(input: DeliveryInput): Promise<DeliveryResult>;
}
export const LINE_TRANSPORT = Symbol('LINE_TRANSPORT');
export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');
