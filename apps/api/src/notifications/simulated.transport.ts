import { Injectable } from '@nestjs/common';
import { Transport, type DeliveryInput, type DeliveryResult } from './transport.js';

export type SimulatedDelivery = { notificationId: string; channel: 'line' | 'email'; recipient: string; subject: string; text: string; at: string };
const MAX = 200;
/** Development stand-in for LINE and email: nothing leaves the machine, staff can read what would have been sent. */
@Injectable()
export class SimulatedTransport {
  private readonly deliveries: SimulatedDelivery[] = [];
  channelFor(channel: 'line' | 'email'): Transport {
    const send = async (input: DeliveryInput): Promise<DeliveryResult> => {
      this.deliveries.push({ notificationId: input.notificationId, channel, recipient: channel === 'line' ? input.recipient.displayName : input.recipient.email ?? '', subject: input.subject, text: input.text, at: new Date().toISOString() });
      if (this.deliveries.length > MAX) this.deliveries.shift();
      return { kind: 'sent', providerId: `simulated-${input.notificationId}` };
    };
    return { channel, send };
  }
  captured(): readonly SimulatedDelivery[] { return this.deliveries; }
  clear(): void { this.deliveries.length = 0; }
}
