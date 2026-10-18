import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { Transport, type DeliveryInput, type DeliveryResult } from './transport.js';

/** Resend-compatible email API. The dedupe key is the Idempotency-Key, so retries do not duplicate. */
@Injectable()
export class EmailTransport extends Transport {
  readonly channel = 'email' as const;
  constructor(@Inject(APP_CONFIG) private readonly config: ApplicationConfig) { super(); }
  async send(input: DeliveryInput): Promise<DeliveryResult> {
    const email = this.config.email;
    if (!email) return { kind: 'unavailable', code: 'email_not_configured' };
    if (!input.recipient.email) return { kind: 'unavailable', code: 'no_email' };
    let response: Response;
    try {
      response = await fetch(`${email.apiBase}/emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${email.apiKey}`, 'Idempotency-Key': input.dedupeKey },
        body: JSON.stringify({ from: email.from, to: [input.recipient.email], subject: input.subject, text: input.text }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return { kind: 'retryable', code: 'network' };
    }
    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { id?: string } | null;
      return { kind: 'sent', providerId: body?.id ?? null };
    }
    if (response.status === 429 || response.status >= 500 || response.status === 409) return { kind: 'retryable', code: `http_${response.status}` };
    if (response.status === 401 || response.status === 403) return { kind: 'unavailable', code: 'auth' };
    return { kind: 'permanent_failure', code: `http_${response.status}` };
  }
}
