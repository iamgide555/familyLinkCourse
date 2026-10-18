import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { NotificationItem } from './transport.js';
import { randomUUID } from 'node:crypto';

/**
 * Creates tomorrow's reminders. One LINE record per organization, LINE account, template and date; members
 * with no LINE account get their own email record. Re-running the job reuses the same records.
 */
@Injectable()
export class Reminders {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async createForDate(organizationId: string, targetDate: string): Promise<{ line: number; email: number; followUp: number }> {
    const sessions = await this.db.courseSession.findMany({ where: { organizationId, date: targetDate, status: 'scheduled', run: { status: 'active', deletedAt: null } }, include: { run: true } });
    const items: NotificationItem[] = [];
    for (const s of sessions) {
      if (s.run.perSessionRegistration) {
        const entries = await this.db.registrationSession.findMany({ where: { organizationId, sessionId: s.id, status: 'confirmed' }, include: { registration: { select: { id: true, memberId: true } } } });
        for (const e of entries) items.push({ memberId: e.registration.memberId, registrationId: e.registration.id, sessionId: s.id });
      } else {
        const regs = await this.db.registration.findMany({ where: { organizationId, runId: s.runId, status: 'confirmed' }, select: { id: true, memberId: true } });
        for (const r of regs) items.push({ memberId: r.memberId, registrationId: r.id, sessionId: s.id });
      }
    }
    const members = await this.db.member.findMany({ where: { organizationId, id: { in: [...new Set(items.map((i) => i.memberId))] }, deletedAt: null } });
    const byId = new Map(members.map((m) => [m.id, m]));
    const lineGroups = new Map<string, NotificationItem[]>();
    const memberItems = new Map<string, NotificationItem[]>();
    for (const item of items) {
      const m = byId.get(item.memberId);
      if (!m) continue;
      if (m.lineAccountId) lineGroups.set(m.lineAccountId, [...(lineGroups.get(m.lineAccountId) ?? []), item]);
      else memberItems.set(m.id, [...(memberItems.get(m.id) ?? []), item]);
    }
    const counts = { line: 0, email: 0, followUp: 0 };
    const base = { organizationId, kind: 'session.reminder', entityRefs: {}, targetDate };
    for (const [accountId, groupItems] of lineGroups) {
      const r = await this.db.notification.createMany({ skipDuplicates: true, data: [{ ...base, eventId: randomUUID(), recipientKind: 'line_account', recipientId: accountId, lineAccountId: accountId, channel: 'line', status: 'queued', items: groupItems as never, dedupeKey: `reminder:${targetDate}:line:${accountId}` }] });
      counts.line += r.count;
    }
    for (const [memberId, memberList] of memberItems) {
      const hasEmail = !!byId.get(memberId)!.email.trim();
      const r = await this.db.notification.createMany({ skipDuplicates: true, data: [{ ...base, eventId: randomUUID(), recipientKind: 'member', recipientId: memberId, channel: hasEmail ? 'email' : 'none', status: hasEmail ? 'queued' : 'staff_followup', lastErrorCode: hasEmail ? null : 'no_channel', items: memberList as never, dedupeKey: `reminder:${targetDate}:${hasEmail ? 'email' : 'followup'}:${memberId}` }] });
      if (hasEmail) counts.email += r.count; else counts.followUp += r.count;
    }
    return counts;
  }
}
