import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Notification } from '../generated/prisma/client.js';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { PrismaService } from '../database/prisma.service.js';
import { Clock } from '../common/clock.js';
import { FieldCrypto, type EncryptedValue } from '../crypto/field-crypto.js';
import { bangkokDate } from '../common/bangkok.js';
import { LEASE_MS, nextRetry } from './delivery-policy.js';
import { EmailTransport } from './email.transport.js';
import { LineTransport } from './line.transport.js';
import { MessageBuilder, type Built } from './message-builder.js';
import { SimulatedTransport } from './simulated.transport.js';
import type { DeliveryResult, NotificationItem, ResolvedRecipient, Transport } from './transport.js';

type Resolved = { name: string; memberId: string | null; lineUserId: string | null; lineReachable: boolean; email: string | null };
const BATCH = 20;

/**
 * Sends queued notices after commit. Records are claimed with row locks and a lease, so two workers never take the
 * same one and a crashed worker's records are picked up again. LINE goes first; email only when LINE is unavailable
 * or failed for good; if neither works a record is flagged for staff.
 */
@Injectable()
export class NotificationWorker {
  readonly owner = randomUUID();
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig,
    @Inject(MessageBuilder) private readonly builder: MessageBuilder,
    @Inject(LineTransport) private readonly line: LineTransport,
    @Inject(EmailTransport) private readonly email: EmailTransport,
    @Inject(SimulatedTransport) private readonly simulated: SimulatedTransport,
  ) {}

  private transport(channel: 'line' | 'email'): Transport {
    if (channel === 'line') return this.config.line ? this.line : this.simulated.channelFor('line');
    return this.config.email ? this.email : this.simulated.channelFor('email');
  }
  /** Claims due records for this worker and sends them. Returns how many were handled. */
  async tick(now: Date = this.clock.now()): Promise<number> {
    const lease = new Date(now.getTime() + LEASE_MS);
    const claimed = await this.db.$queryRaw<Array<{ id: string }>>`
      WITH due AS (
        SELECT id FROM notifications
        WHERE organization_id = ${this.config.organizationId}
          AND ((status IN ('queued', 'retry') AND (next_attempt_at IS NULL OR next_attempt_at <= ${now}))
           OR (status = 'sending' AND lease_expires_at <= ${now}))
        ORDER BY created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${BATCH})
      UPDATE notifications n SET status = 'sending', lease_owner = ${this.owner}, lease_expires_at = ${lease}
      FROM due WHERE n.id = due.id RETURNING n.id`;
    for (const { id } of claimed) await this.process(id, now).catch(() => this.release(id));
    return claimed.length;
  }
  /** An unexpected error leaves the record for the next tick instead of losing it. */
  private async release(id: string): Promise<void> {
    await this.db.notification.updateMany({ where: { id, leaseOwner: this.owner, status: 'sending' }, data: { status: 'retry', nextAttemptAt: new Date(this.clock.now().getTime() + 60_000), lastErrorCode: 'worker_error' } });
  }
  private async finish(n: Notification, data: Record<string, unknown>): Promise<void> {
    await this.db.notification.updateMany({ where: { id: n.id, leaseOwner: this.owner, status: 'sending' }, data: { ...data, leaseOwner: null, leaseExpiresAt: null } });
  }

  private async resolve(n: Notification): Promise<Resolved | null> {
    const account = async (id: string | null) => (id ? this.db.lineAccount.findFirst({ where: { organizationId: n.organizationId, id } }) : null);
    if (n.recipientKind === 'member') {
      const member = await this.db.member.findFirst({ where: { organizationId: n.organizationId, id: n.recipientId, deletedAt: null } });
      if (!member) return null;
      const la = await account(member.lineAccountId);
      return { name: `${member.firstName} ${member.lastName}`, memberId: member.id, lineUserId: la?.lineUserId ?? null, lineReachable: !!la?.reachable, email: member.email.trim() || null };
    }
    if (n.recipientKind === 'signup_request') {
      const request = await this.db.signupRequest.findFirst({ where: { organizationId: n.organizationId, id: n.recipientId } });
      if (!request) return null;
      const submitted = JSON.parse(this.crypto.decrypt(request.submittedDataEncrypted as EncryptedValue)) as { firstName?: string; lastName?: string; email?: string };
      const la = await account(request.lineAccountId);
      return { name: `${submitted.firstName ?? ''} ${submitted.lastName ?? ''}`.trim(), memberId: null, lineUserId: la?.lineUserId ?? null, lineReachable: !!la?.reachable, email: submitted.email?.trim() || null };
    }
    const la = await account(n.recipientId);
    return la ? { name: la.displayName || 'สมาชิก', memberId: null, lineUserId: la.lineUserId, lineReachable: la.reachable, email: null } : null;
  }
  /** LINE usage this Bangkok month (one grouped reminder is one push). */
  async lineUsage(organizationId: string, now: Date = this.clock.now()): Promise<number> {
    const month = bangkokDate(now).slice(0, 7);
    return this.db.notification.count({ where: { organizationId, channel: 'line', status: 'sent', sentAt: { gte: new Date(`${month}-01T00:00:00+07:00`) } } });
  }
  private async lineAvailable(n: Notification, r: Resolved, now: Date): Promise<boolean> {
    if (!r.lineUserId || !r.lineReachable) return false;
    const quota = this.config.line?.monthlyQuota;
    return !(quota && (await this.lineUsage(n.organizationId, now)) >= quota);
  }

  private async process(id: string, now: Date): Promise<void> {
    const n = await this.db.notification.findUnique({ where: { id } });
    if (!n || n.leaseOwner !== this.owner || n.status !== 'sending') return;
    const r = await this.resolve(n);
    if (!r) return this.finish(n, { status: 'skipped', lastErrorCode: 'recipient_gone' });
    const built: Built = await this.builder.build(n, { name: r.name, memberId: r.memberId });
    if (built.kind === 'skip') return this.finish(n, { status: 'skipped', lastErrorCode: built.reason });
    const plan: 'line' | 'email' = n.channel === 'email' ? 'email' : 'line';
    if (plan === 'line' && !(await this.lineAvailable(n, r, now))) return this.fallback(n, built, r, 'line_unavailable');
    if (plan === 'email' && !r.email) return this.finish(n, { status: 'staff_followup', channel: 'email', lastErrorCode: 'no_email' });
    const recipient: ResolvedRecipient = { lineUserId: r.lineUserId, email: r.email, displayName: r.name };
    let result: DeliveryResult;
    try {
      result = await this.transport(plan).send({ notificationId: n.id, dedupeKey: n.dedupeKey, recipient, template: n.kind, subject: built.subject, text: built.text, items: built.items });
    } catch {
      result = { kind: 'retryable', code: 'transport_error' };
    }
    const attempts = n.attempts + 1;
    if (result.kind === 'sent') return this.finish(n, { status: 'sent', channel: plan, attempts, sentAt: now, providerId: result.providerId, lastErrorCode: null, nextAttemptAt: null, items: built.items as never });
    if (result.kind === 'retryable') {
      const next = nextRetry(attempts, now);
      if (next) return this.finish(n, { status: 'retry', channel: plan, attempts, nextAttemptAt: next, lastErrorCode: result.code });
    }
    const code = result.code;
    if (plan === 'line') return this.fallback({ ...n, attempts }, built, r, code);
    return this.finish(n, { status: 'staff_followup', channel: 'email', attempts, lastErrorCode: code });
  }

  /** LINE could not deliver: queue separate email records (one per member) or flag the record for staff. */
  private async fallback(n: Notification, built: Extract<Built, { kind: 'send' }>, r: Resolved, code: string): Promise<void> {
    const memberIds = [...new Set(built.items.map((i) => i.memberId))];
    const perMember = n.kind === 'session.reminder' && n.recipientKind === 'line_account';
    const targets: Array<{ memberId: string | null; email: string | null; items: NotificationItem[] }> = [];
    if (perMember) {
      const members = await this.db.member.findMany({ where: { organizationId: n.organizationId, id: { in: memberIds }, deletedAt: null } });
      for (const m of members) targets.push({ memberId: m.id, email: m.email.trim() || null, items: built.items.filter((i) => i.memberId === m.id) });
    } else targets.push({ memberId: r.memberId, email: r.email, items: built.items });
    const withEmail = targets.filter((t) => t.email);
    if (!withEmail.length) return this.finish(n, { status: 'staff_followup', channel: 'line', attempts: n.attempts, lastErrorCode: !code || code === 'line_unavailable' ? 'no_channel' : code });
    await this.db.$transaction(async (tx) => {
      for (const t of withEmail)
        await tx.notification.createMany({ skipDuplicates: true, data: [{
          organizationId: n.organizationId, eventId: randomUUID(), kind: n.kind,
          recipientKind: perMember ? 'member' : n.recipientKind, recipientId: perMember ? t.memberId! : n.recipientId,
          entityRefs: n.entityRefs as never, channel: 'email', status: 'queued', parentId: n.id,
          dedupeKey: perMember ? `${n.dedupeKey}:email:${t.memberId}` : `${n.dedupeKey}:email`,
          items: t.items as never, targetDate: n.targetDate,
        }] });
      for (const t of targets.filter((x) => !x.email && x.memberId))
        await tx.notification.createMany({ skipDuplicates: true, data: [{
          organizationId: n.organizationId, eventId: randomUUID(), kind: n.kind, recipientKind: 'member', recipientId: t.memberId!, entityRefs: n.entityRefs as never,
          channel: 'none', status: 'staff_followup', parentId: n.id, dedupeKey: `${n.dedupeKey}:followup:${t.memberId}`, lastErrorCode: 'no_channel', items: t.items as never, targetDate: n.targetDate,
        }] });
      await tx.notification.updateMany({ where: { id: n.id, leaseOwner: this.owner, status: 'sending' }, data: { status: 'fell_back', channel: 'line', attempts: n.attempts, lastErrorCode: code || 'line_unavailable', leaseOwner: null, leaseExpiresAt: null } });
    });
  }
}
