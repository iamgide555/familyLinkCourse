import { Inject, Injectable } from '@nestjs/common';
import type { Notification } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { OrgSettings } from '../settings/org-settings.service.js';
import { renderTemplate } from './templates.js';
import type { NotificationItem } from './transport.js';

export type Built = { kind: 'send'; text: string; subject: string; items: NotificationItem[] } | { kind: 'skip'; reason: string };
export type RecipientInfo = { name: string; memberId: string | null };

const SUBJECT = 'แจ้งจากสมาคม FamilyLink';
const EXPECTED: Record<string, string[]> = {
  'registration.confirmed': ['confirmed'], 'registration.submitted': ['submitted'], 'registration.waitlisted': ['waitlisted'],
  'registration.approved': ['confirmed'], 'registration.rejected': ['rejected'], 'waitlist.promoted': ['submitted', 'confirmed'],
};
const thaiDate = (date: string) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${date}T00:00:00Z`));
type Session = { dayNo: number; date: string; startTime: string; endTime: string };
const sessionLine = (s: Session) => `วันที่ ${s.dayNo} (${thaiDate(s.date)} ${s.startTime}-${s.endTime} น.)`;
const range = (sessions: Session[]) => (sessions.length ? (sessions.length === 1 ? sessionLine(sessions[0]!) : `${thaiDate(sessions[0]!.date)} – ${thaiDate(sessions[sessions.length - 1]!.date)} (${sessions.length} วัน)`) : '');

/**
 * Builds message text from the templates and the *current* database state. Items that changed since the
 * event was queued (cancelled, relinked, no longer confirmed) are dropped, and an empty result is skipped.
 */
@Injectable()
export class MessageBuilder {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(OrgSettings) private readonly settings: OrgSettings,
  ) {}

  async build(n: Notification, recipient: RecipientInfo): Promise<Built> {
    const templates = (await this.settings.get(n.organizationId)).messages;
    const template = templates[n.kind] ?? '';
    if (n.kind === 'session.reminder') return this.reminder(n, template);
    if (n.kind.startsWith('signup.') || n.kind.startsWith('profile.')) return { kind: 'send', text: renderTemplate(template, { member: recipient.name }), subject: SUBJECT, items: [] };
    const refs = n.entityRefs as { registrationIds?: string[]; sessionIds?: string[] };
    const registrationId = refs.registrationIds?.[0];
    if (!registrationId) return { kind: 'skip', reason: 'no_registration' };
    const reg = await this.db.registration.findFirst({ where: { organizationId: n.organizationId, id: registrationId }, include: { member: true, entries: true, run: { include: { course: true, sessions: { orderBy: { startsAt: 'asc' } } } } } });
    if (!reg || reg.member.deletedAt) return { kind: 'skip', reason: 'registration_gone' };
    const run = reg.run;
    const wanted = refs.sessionIds?.length ? run.sessions.filter((s) => refs.sessionIds!.includes(s.id)) : run.sessions;
    let sessions: Session[];
    if (n.kind === 'run.cancelled') sessions = run.sessions.filter((s) => s.status !== 'cancelled' || true);
    else if (n.kind === 'session.cancelled') sessions = wanted;
    else if (n.kind === 'session.rescheduled') {
      const active = run.perSessionRegistration ? wanted.filter((s) => reg.entries.some((e) => e.sessionId === s.id && ['submitted', 'confirmed', 'waitlisted'].includes(e.status))) : ['submitted', 'confirmed', 'waitlisted'].includes(reg.status ?? '') ? wanted : [];
      if (!active.length) return { kind: 'skip', reason: 'no_longer_registered' };
      sessions = active.filter((s) => s.status === 'scheduled');
      if (!sessions.length) return { kind: 'skip', reason: 'session_cancelled' };
    } else {
      const expected = EXPECTED[n.kind] ?? [];
      if (run.perSessionRegistration) {
        const live = wanted.filter((s) => s.status === 'scheduled' && reg.entries.some((e) => e.sessionId === s.id && expected.includes(e.status)));
        if (!live.length) return { kind: 'skip', reason: 'state_changed' };
        sessions = live;
      } else {
        if (!expected.includes(reg.status ?? '') || run.status === 'cancelled') return { kind: 'skip', reason: 'state_changed' };
        sessions = run.sessions.filter((s) => s.status === 'scheduled');
      }
    }
    const outcome = n.kind === 'waitlist.promoted' ? (run.requireApproval ? 'รอเจ้าหน้าที่อนุมัติ' : 'ยืนยันที่นั่งแล้ว') : '';
    const text = renderTemplate(template, { member: `${reg.member.firstName} ${reg.member.lastName}`, course: run.course.name, sessions: run.perSessionRegistration || n.kind.startsWith('session.') ? sessions.map(sessionLine).join(', ') : range(sessions), outcome });
    return { kind: 'send', text, subject: `${SUBJECT}: ${run.course.name}`, items: [{ memberId: reg.memberId, sessionId: sessions.length === 1 ? (run.sessions.find((s) => s.dayNo === sessions[0]!.dayNo)?.id ?? null) : null, registrationId: reg.id }] };
  }

  private async reminder(n: Notification, template: string): Promise<Built> {
    const items = ((n.items ?? []) as NotificationItem[]).filter((i) => i.sessionId && i.registrationId);
    const rows: Array<{ item: NotificationItem; line: string; memberId: string; member: string; course: string }> = [];
    for (const item of items) {
      const session = await this.db.courseSession.findFirst({ where: { organizationId: n.organizationId, id: item.sessionId! }, include: { run: { include: { course: true } } } });
      if (!session || session.status !== 'scheduled' || session.run.status !== 'active' || session.run.deletedAt || session.date !== n.targetDate) continue;
      const reg = await this.db.registration.findFirst({ where: { organizationId: n.organizationId, id: item.registrationId!, memberId: item.memberId }, include: { member: true, entries: { where: { sessionId: session.id } } } });
      if (!reg || reg.member.deletedAt) continue;
      const confirmed = session.run.perSessionRegistration ? reg.entries[0]?.status === 'confirmed' : reg.status === 'confirmed';
      if (!confirmed) continue;
      // LINE records belong to one account; a member moved elsewhere since queueing must not be told here.
      if (n.channel === 'line' && n.lineAccountId && reg.member.lineAccountId !== n.lineAccountId) continue;
      rows.push({ item, memberId: reg.memberId, member: `${reg.member.firstName} ${reg.member.lastName}`, course: session.run.course.name, line: sessionLine(session) });
    }
    if (!rows.length) return { kind: 'skip', reason: 'nothing_to_remind' };
    const grouped = new Map<string, typeof rows>();
    for (const r of rows) grouped.set(`${r.memberId}|${r.course}`, [...(grouped.get(`${r.memberId}|${r.course}`) ?? []), r]);
    const text = [...grouped.values()].map((g) => renderTemplate(template, { member: g[0]!.member, course: g[0]!.course, sessions: g.map((x) => x.line).join(', ') })).join('\n\n');
    return { kind: 'send', text, subject: `${SUBJECT}: เตือนวันเรียนพรุ่งนี้`, items: rows.map((r) => r.item) };
  }
}
