import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { Transport, type DeliveryInput, type DeliveryResult } from './transport.js';

/** LINE Messaging API push. The notification id doubles as X-Line-Retry-Key, so a retry never sends a second copy. */
@Injectable()
export class LineTransport extends Transport {
  readonly channel = 'line' as const;
  constructor(@Inject(APP_CONFIG) private readonly config: ApplicationConfig) { super(); }
  async send(input: DeliveryInput): Promise<DeliveryResult> {
    const line = this.config.line;
    if (!line) return { kind: 'unavailable', code: 'line_not_configured' };
    if (!input.recipient.lineUserId) return { kind: 'unavailable', code: 'no_line_user' };
    let response: Response;
    try {
      response = await fetch(`${line.apiBase}/v2/bot/message/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${line.channelAccessToken}`, 'X-Line-Retry-Key': input.notificationId },
        body: JSON.stringify({ to: input.recipient.lineUserId, messages: [{ type: 'text', text: input.text.slice(0, 4900) }] }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // A timeout is ambiguous: the push may have gone out. The retry key makes the next attempt safe.
      return { kind: 'retryable', code: 'network' };
    }
    if (response.ok) return { kind: 'sent', providerId: response.headers.get('x-line-request-id') };
    // 409 means this retry key was already accepted: the first attempt was delivered.
    if (response.status === 409) return { kind: 'sent', providerId: response.headers.get('x-line-accepted-request-id') };
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.status === 429) return /monthly limit/i.test(body?.message ?? '') ? { kind: 'unavailable', code: 'quota' } : { kind: 'retryable', code: 'rate_limited' };
    if (response.status === 401 || response.status === 403) return { kind: 'unavailable', code: 'auth' };
    if (response.status >= 500) return { kind: 'retryable', code: `http_${response.status}` };
    return { kind: 'permanent_failure', code: `http_${response.status}` };
  }
}
