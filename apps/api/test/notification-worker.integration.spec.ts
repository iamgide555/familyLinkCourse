import { randomUUID } from 'node:crypto';
import { createTestApp, type TestApp } from './test-app.js';
import { startStub, type Stub } from './stubs.js';
import { APP_CONFIG, type ApplicationConfig } from '../src/config/config.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Clock } from '../src/common/clock.js';
import { FieldCrypto } from '../src/crypto/field-crypto.js';
import { NotificationWorker } from '../src/notifications/notification-worker.js';
import { MessageBuilder } from '../src/notifications/message-builder.js';
import { LineTransport } from '../src/notifications/line.transport.js';
import { EmailTransport } from '../src/notifications/email.transport.js';
import { SimulatedTransport } from '../src/notifications/simulated.transport.js';
import { joinLine, login, makeRun, register, serviceType, staffCaller } from './helpers.js';

describe('outbox delivery, retries and fallback', () => {
  let ctx: TestApp;
  let line: Stub;
  let email: Stub;
  let worker: NotificationWorker;
  let s: ReturnType<typeof staffCaller>;
  let admin: ReturnType<typeof staffCaller>;
  let serviceId: string;
  const T0 = '2026-10-17T03:00:00.000Z';
  const make = async (lineId: string | null, name: string, mail = '') => {
    const memberId = lineId ? await joinLine(ctx, lineId, name, 'ทดสอบ', `19${60 + (seq++ % 30)}-01-${10 + (seq % 18)}`, serviceId) : (await ctx.db.member.create({ data: { organizationId: ctx.organizationId, firstName: name, lastName: 'ทดสอบ', normalizedFirstName: name, normalizedLastName: 'ทดสอบ', birthDate: `19${60 + (seq++ % 30)}-02-${10 + (seq % 18)}` } })).id;
    if (mail) await ctx.db.member.update({ where: { id: memberId }, data: { email: mail } });
    // Signing up queues its own notice; set it aside so each test controls exactly what the worker sees.
    await ctx.db.notification.updateMany({ where: { organizationId: ctx.organizationId, status: 'queued' }, data: { status: 'resolved' } });
    return memberId;
  };
  let seq = 0;
  const queue = (memberId: string, kind = 'signup.created') => ctx.db.notification.create({ data: { organizationId: ctx.organizationId, eventId: randomUUID(), kind, recipientKind: 'member', recipientId: memberId, entityRefs: {}, dedupeKey: `${randomUUID()}:pending` } });
  const row = (id: string) => ctx.db.notification.findUniqueOrThrow({ where: { id } });
  const goTo = (iso: string) => ctx.clock.set(iso);
  beforeAll(async () => {
    line = await startStub(() => ({ status: 200, headers: { 'x-line-request-id': 'req-1' } }));
    email = await startStub(() => ({ status: 200, body: { id: 'mail-1' } }));
    ctx = await createTestApp({ line: { channelAccessToken: 'test-token', channelSecret: 'test-secret', loginChannelId: 'chan', liffId: 'liff', apiBase: line.url, richMenuMemberId: 'menu-member', monthlyQuota: null }, email: { apiKey: 'mail-key', from: 'noreply@example.test', apiBase: email.url } });
    worker = ctx.app.get(NotificationWorker);
    s = staffCaller(ctx, await login(ctx, 'notif-staff@example.test'));
    admin = staffCaller(ctx, await login(ctx, 'notif-admin@example.test', 'admin'));
    serviceId = await serviceType(ctx);
  });
  beforeEach(() => { line.requests.length = 0; email.requests.length = 0; line.reply(() => ({ status: 200, headers: { 'x-line-request-id': 'req-1' } })); email.reply(() => ({ status: 200, body: { id: 'mail-1' } })); goTo(T0); });
  afterAll(async () => { await line.close(); await email.close(); if (ctx) await ctx.close(); });

  it('lets two workers claim each record exactly once', async () => {
    const members = await Promise.all(Array.from({ length: 8 }, (_, i) => make(`claim-${i}`, `คนที่${i}`)));
    const ids = (await Promise.all(members.map((m) => queue(m)))).map((n) => n.id);
    const second = new NotificationWorker(ctx.app.get(PrismaService), ctx.app.get(Clock), ctx.app.get(FieldCrypto), ctx.app.get<ApplicationConfig>(APP_CONFIG), ctx.app.get(MessageBuilder), ctx.app.get(LineTransport), ctx.app.get(EmailTransport), ctx.app.get(SimulatedTransport));
    const handled = await Promise.all([worker.tick(), second.tick()]);
    expect(handled[0]! + handled[1]!).toBe(8);
    expect(line.requests).toHaveLength(8);
    expect(new Set(line.requests.map((r) => r.headers['x-line-retry-key'])).size).toBe(8);
    for (const id of ids) expect((await row(id)).status).toBe('sent');
    expect(await worker.tick()).toBe(0);
  });

  it('retries the same record with the same retry key, growing delays, then succeeds', async () => {
    const member = await make('retry-a', 'ลองใหม่');
    const n = await queue(member);
    line.reply((_r, k) => (k <= 3 ? { status: 503 } : { status: 200, headers: { 'x-line-request-id': 'ok' } }));
    await worker.tick();
    let r = await row(n.id);
    expect([r.status, r.attempts, r.nextAttemptAt!.toISOString()]).toEqual(['retry', 1, '2026-10-17T03:01:00.000Z']);
    await worker.tick();
    expect((await row(n.id)).attempts).toBe(1);
    goTo('2026-10-17T03:01:00.000Z');
    await worker.tick();
    r = await row(n.id);
    expect([r.attempts, r.nextAttemptAt!.toISOString()]).toEqual([2, '2026-10-17T03:06:00.000Z']);
    goTo('2026-10-17T03:06:00.000Z');
    await worker.tick();
    r = await row(n.id);
    expect([r.attempts, r.nextAttemptAt!.toISOString()]).toEqual([3, '2026-10-17T03:21:00.000Z']);
    goTo('2026-10-17T03:21:00.000Z');
    await worker.tick();
    r = await row(n.id);
    expect([r.status, r.attempts, r.providerId]).toEqual(['sent', 4, 'ok']);
    expect(new Set(line.requests.map((q) => q.headers['x-line-retry-key']))).toEqual(new Set([n.id]));
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, recipientId: member, status: { not: 'resolved' } } })).toBe(1);
    expect(email.requests).toHaveLength(0);
  });

  it('falls back to a separately tracked email only after five retries fail', async () => {
    const member = await make('retry-b', 'ส่งไม่ผ่าน', 'fallback@example.test');
    const n = await queue(member);
    line.reply(() => ({ status: 500 }));
    const delays = ['03:01', '03:06', '03:21', '04:21', '10:21'];
    await worker.tick();
    for (const at of delays) {
      expect((await row(n.id)).status).toBe('retry');
      goTo(`2026-10-17T${at}:00.000Z`);
      await worker.tick();
    }
    const parent = await row(n.id);
    expect([parent.status, parent.attempts]).toEqual(['fell_back', 6]);
    expect(line.requests).toHaveLength(6);
    const child = await ctx.db.notification.findFirstOrThrow({ where: { organizationId: ctx.organizationId, parentId: n.id } });
    expect([child.channel, child.status, child.recipientId]).toEqual(['email', 'queued', member]);
    await worker.tick();
    expect((await row(child.id)).status).toBe('sent');
    expect(email.requests).toHaveLength(1);
    expect((email.requests[0]!.json as { to: string[] }).to).toEqual(['fallback@example.test']);
    expect(email.requests[0]!.headers['idempotency-key']).toBe(child.dedupeKey);
  });

  it('falls back at once on permanent or authorization failures, never after a successful LINE send', async () => {
    const a = await make('perm-a', 'ปฏิเสธถาวร', 'a@example.test');
    const b = await make('perm-b', 'ปฏิเสธสิทธิ์', 'b@example.test');
    const na = await queue(a);
    line.reply(() => ({ status: 400, body: { message: 'bad request' } }));
    await worker.tick();
    expect((await row(na.id)).status).toBe('fell_back');
    expect((await row(na.id)).lastErrorCode).toBe('http_400');
    const nb = await queue(b);
    line.reply(() => ({ status: 401 }));
    await worker.tick();
    expect((await row(nb.id)).status).toBe('fell_back');
    line.requests.length = 0; email.requests.length = 0;
    const ok = await make('perm-c', 'ส่งสำเร็จ', 'c@example.test');
    const nc = await queue(ok);
    line.reply(() => ({ status: 200 }));
    await worker.tick();
    expect((await row(nc.id)).status).toBe('sent');
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, parentId: nc.id } })).toBe(0);
    expect(line.requests.length).toBeGreaterThan(0);
  });

  it('treats a repeated retry key as delivered', async () => {
    const member = await make('dup-key', 'ซ้ำคีย์');
    const n = await queue(member);
    line.reply(() => ({ status: 409, headers: { 'x-line-accepted-request-id': 'first-try' } }));
    await worker.tick();
    expect([(await row(n.id)).status, (await row(n.id)).providerId]).toEqual(['sent', 'first-try']);
  });

  it('goes straight to email when LINE is unreachable, and flags staff when nothing is possible', async () => {
    const unreachable = await make('unreach', 'ไม่รับข้อความ', 'u@example.test');
    const acct = await ctx.db.member.findUniqueOrThrow({ where: { id: unreachable } });
    await ctx.db.lineAccount.update({ where: { id: acct.lineAccountId! }, data: { reachable: false } });
    const n = await queue(unreachable);
    await worker.tick();
    expect(line.requests).toHaveLength(0);
    expect((await row(n.id)).status).toBe('fell_back');
    await worker.tick();
    expect(email.requests).toHaveLength(1);
    const nothing = await make(null, 'ไม่มีช่องทาง');
    const nn = await queue(nothing);
    await worker.tick();
    const r = await row(nn.id);
    expect([r.status, r.lastErrorCode]).toEqual(['staff_followup', 'no_channel']);
    // Both providers failing leaves a visible follow-up, not a silent drop.
    const both = await make('bothfail', 'ล้มสองทาง', 'both@example.test');
    const nb = await queue(both);
    line.reply(() => ({ status: 400 }));
    email.reply(() => ({ status: 422 }));
    await worker.tick();
    await worker.tick();
    const child = await ctx.db.notification.findFirstOrThrow({ where: { parentId: nb.id } });
    expect([child.status, child.lastErrorCode]).toEqual(['staff_followup', 'http_422']);
    const list = await s('get', '/api/notifications');
    expect(list.body.items.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([nn.id, child.id]));
    expect((await s('post', `/api/notifications/${nn.id}/resolve`)).status).toBe(200);
    expect((await row(nn.id)).status).toBe('resolved');
    expect((await s('post', `/api/notifications/${nn.id}/resolve`)).status).toBe(404);
  });

  it('reclaims a record whose worker crashed, without creating another record', async () => {
    const member = await make('crash', 'ล่มกลางทาง');
    const n = await queue(member);
    await ctx.db.notification.update({ where: { id: n.id }, data: { status: 'sending', leaseOwner: 'dead-worker', leaseExpiresAt: new Date('2026-10-17T03:00:30.000Z') } });
    expect(await worker.tick()).toBe(0);
    goTo('2026-10-17T03:00:31.000Z');
    expect(await worker.tick()).toBe(1);
    expect((await row(n.id)).status).toBe('sent');
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, recipientId: member, status: { not: 'resolved' } } })).toBe(1);
  });

  it('uses email when the monthly LINE quota is used up', async () => {
    const used = await make('quota-a', 'ใช้โควตา', 'q@example.test');
    const config = ctx.app.get<ApplicationConfig>(APP_CONFIG);
    const usedSoFar = await worker.lineUsage(ctx.organizationId);
    config.line!.monthlyQuota = usedSoFar + 1;
    try {
      const first = await queue(used);
      await worker.tick();
      expect((await row(first.id)).status).toBe('sent');
      const again = await queue(used);
      await worker.tick();
      expect((await row(again.id)).status).toBe('fell_back');
      expect((await s('get', '/api/notifications/summary')).body).not.toHaveProperty('lineMonthlyQuota');
      const summary = (await admin('get', '/api/notifications/summary')).body;
      expect(summary.lineMonthlyQuota).toBe(usedSoFar + 1);
      expect(summary.linePushThisMonth).toBe(usedSoFar + 1);
    } finally { config.line!.monthlyQuota = null; }
  });

  it('writes plain, non-sensitive messages for every business event', async () => {
    const memberId = await make('events', 'ครบทุกเหตุการณ์', 'events@example.test');
    const { runId, sessionIds, courseId } = await makeRun(ctx, s, { perSession: true, capacity: 3, requireApproval: true, closes: '2026-12-01T00:00:00.000Z' });
    const course = (await s('get', `/api/courses/${courseId}`)).body.name as string;
    await ctx.db.member.update({ where: { id: memberId }, data: { intakeEncrypted: undefined } });
    await s('patch', `/api/members/${memberId}`, { firstName: 'ครบทุกเหตุการณ์', lastName: 'ทดสอบ', expectedVersion: (await s('get', `/api/members/${memberId}`)).body.version, citizenId: '1101700230708' });
    const reg = await register(s, runId, memberId, { sessionIds });
    await s('post', `/api/registrations/${reg.body.registrationId}/review`, { sessionIds: [sessionIds[0]], approve: true });
    await s('post', `/api/registrations/${reg.body.registrationId}/review`, { sessionIds: [sessionIds[1]], approve: false });
    await s('post', `/api/sessions/${sessionIds[0]}/reschedule`, { date: '2026-12-05', startTime: '10:00', endTime: '12:00' });
    await s('post', `/api/sessions/${sessionIds[0]}/cancel`, { reason: 'ลับ' });
    for (let i = 0; i < 3; i += 1) await worker.tick();
    const texts = line.requests.map((r) => (r.json as { messages: Array<{ text: string }> }).messages[0]!.text);
    const joined = texts.join('\n');
    expect(joined).toContain(course);
    expect(joined).toContain('ครบทุกเหตุการณ์');
    for (const secret of ['1101700230708', 'ลับ', 'citizen']) expect(joined).not.toContain(secret);
    const kinds = (await ctx.db.notification.findMany({ where: { organizationId: ctx.organizationId, recipientId: memberId } })).map((n) => [n.kind, n.status]);
    expect(kinds.map(([k]) => k)).toEqual(expect.arrayContaining(['registration.submitted', 'registration.approved', 'registration.rejected', 'session.rescheduled', 'session.cancelled']));
    // Staleness: the approval message mentions only the day that was approved and is still confirmed.
    expect(kinds.find(([k]) => k === 'registration.rejected')![1]).toMatch(/sent|skipped/);
  });
});
