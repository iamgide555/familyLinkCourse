import { Inject, Injectable } from '@nestjs/common';
import type { CallGroup, CallItem, NotificationKind } from '../../../../packages/contracts/src/notifications.js';
import { PrismaService } from '../database/prisma.service.js';
import { Clock } from '../common/clock.js';
import { bangkokDate } from '../common/bangkok.js';
import { KIND_WORD } from './kind-words.js';
import { MessageBuilder } from './message-builder.js';
import type { NotificationItem } from './transport.js';

const LIMIT = 500;

/**
 * Notices no channel could deliver, for members staff must phone. The text is rebuilt from current data, so a
 * notice that no longer matches reality (registration cancelled since, session already past) is left out.
 */
@Injectable()
export class CallList {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(MessageBuilder) private readonly builder: MessageBuilder,
  ) {}

  async groups(organizationId: string): Promise<CallGroup[]> {
    const rows = await this.db.notification.findMany({
      where: { organizationId, recipientKind: 'member', status: { in: ['staff_followup', 'failed'] } },
      orderBy: { createdAt: 'asc' }, take: LIMIT,
    });
    const members = await this.db.member.findMany({ where: { organizationId, id: { in: rows.map((r) => r.recipientId) }, deletedAt: null }, select: { id: true, firstName: true, lastName: true, phoneMobile: true } });
    const memberById = new Map(members.map((m) => [m.id, m]));
    const registrationOf = (n: (typeof rows)[number]) => (n.entityRefs as { registrationIds?: string[] }).registrationIds?.[0] ?? ((n.items ?? []) as NotificationItem[])[0]?.registrationId ?? null;
    const registrations = await this.db.registration.findMany({
      where: { organizationId, id: { in: rows.map(registrationOf).filter((id): id is string => !!id) } },
      select: { id: true, run: { select: { id: true, batchName: true, course: { select: { name: true } }, sessions: { where: { status: 'scheduled' }, select: { date: true } } } } },
    });
    const runByRegistration = new Map(registrations.map((r) => [r.id, r.run]));
    const today = bangkokDate(this.clock.now());
    const groups = new Map<string, CallGroup>();
    for (const n of rows) {
      const member = memberById.get(n.recipientId);
      if (!member) continue;
      const name = `${member.firstName} ${member.lastName}`;
      const built = await this.builder.build(n, { name, memberId: member.id });
      if (built.kind === 'skip') continue;
      const registrationId = registrationOf(n);
      const run = registrationId ? runByRegistration.get(registrationId) : undefined;
      const key = run?.id ?? 'none';
      if (!groups.has(key)) {
        const upcoming = run ? run.sessions.map((s) => s.date).filter((d) => d >= today).sort()[0] ?? null : null;
        groups.set(key, { runId: run?.id ?? null, courseName: run?.course.name ?? 'อื่น ๆ', batchName: run?.batchName ?? '', nextSessionDate: upcoming, items: [] });
      }
      const item: CallItem = {
        id: n.id, kind: n.kind as NotificationKind, kindWord: KIND_WORD[n.kind] ?? n.kind, reason: n.lastErrorCode ?? 'unknown',
        memberId: member.id, memberName: name, phone: member.phoneMobile, text: built.text, createdAt: n.createdAt.toISOString(),
      };
      groups.get(key)!.items.push(item);
    }
    return [...groups.values()].sort((a, b) => (a.nextSessionDate ?? '9999').localeCompare(b.nextSessionDate ?? '9999') || a.courseName.localeCompare(b.courseName));
  }
}
