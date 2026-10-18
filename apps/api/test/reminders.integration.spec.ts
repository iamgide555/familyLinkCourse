import { createTestApp, type TestApp } from './test-app.js';
import { startStub, type Stub } from './stubs.js';
import { NotificationWorker } from '../src/notifications/notification-worker.js';
import { Reminders } from '../src/notifications/reminders.service.js';
import { Scheduler } from '../src/jobs/scheduler.js';
import { joinLine, key, login, makeRun, register, serviceType, session, staffCaller } from './helpers.js';

describe('daily reminders for tomorrow’s confirmed sessions', () => {
  let ctx: TestApp;
  let line: Stub;
  let email: Stub;
  let s: ReturnType<typeof staffCaller>;
  let serviceId: string;
  let seq = 0;
  const TOMORROW = '2026-10-18';
  const texts = (stub: Stub) => stub.requests.map((r) => ((r.json as { messages?: Array<{ text: string }>; text?: string }).messages?.[0]?.text ?? (r.json as { text: string }).text));
  const member = async (lineId: string | null, first: string, mail = '') => {
    const birth = `19${50 + (seq++ % 40)}-0${1 + (seq % 9)}-${10 + (seq % 17)}`;
    const id = lineId ? await joinLine(ctx, lineId, first, 'เตือน', birth, serviceId) : (await ctx.db.member.create({ data: { organizationId: ctx.organizationId, firstName: first, lastName: 'เตือน', normalizedFirstName: first, normalizedLastName: 'เตือน', birthDate: birth } })).id;
    if (mail) await ctx.db.member.update({ where: { id }, data: { email: mail } });
    return id;
  };
  const reset = async () => {
    line.requests.length = 0; email.requests.length = 0;
    line.reply(() => ({ status: 200 })); email.reply(() => ({ status: 200, body: { id: 'm' } }));
    await ctx.db.notification.updateMany({ where: { organizationId: ctx.organizationId, status: { in: ['queued', 'retry', 'sending'] } }, data: { status: 'resolved' } });
  };
  const worker = () => ctx.app.get(NotificationWorker);
  const records = (extra: object = {}) => ctx.db.notification.findMany({ where: { organizationId: ctx.organizationId, kind: 'session.reminder', ...extra }, orderBy: { createdAt: 'asc' } });
  beforeAll(async () => {
    line = await startStub(); email = await startStub();
    ctx = await createTestApp({ line: { channelAccessToken: 't', channelSecret: 's', loginChannelId: 'c', liffId: 'l', apiBase: line.url, richMenuMemberId: 'm', monthlyQuota: null }, email: { apiKey: 'k', from: 'noreply@example.test', apiBase: email.url } });
    s = staffCaller(ctx, await login(ctx, 'rem-staff@example.test'));
    serviceId = await serviceType(ctx);
  });
  beforeEach(reset);
  afterAll(async () => { await line.close(); await email.close(); if (ctx) await ctx.close(); });

  const tomorrowRun = (opts: Parameters<typeof makeRun>[2] = {}) => makeRun(ctx, s, { capacity: 20, closes: '2026-12-01T00:00:00.000Z', sessions: [session(TOMORROW), session('2026-10-25')], ...opts });

  it('creates one grouped LINE record per account, per-member email records otherwise, and reuses them on re-run', async () => {
    const { runId } = await tomorrowRun();
    const a = await member('rem-fam', 'พี่', 'a@example.test');
    const b = await member('rem-fam', 'น้อง', 'b@example.test');
    const c = await member(null, 'ไม่มีไลน์', 'c@example.test');
    const d = await member(null, 'ไม่มีช่องทางเลย');
    for (const m of [a, b, c, d]) await register(s, runId, m);
    await reset();
    const first = await ctx.app.get(Reminders).createForDate(ctx.organizationId, TOMORROW);
    expect(first).toEqual({ line: 1, email: 1, followUp: 1 });
    const again = await ctx.app.get(Reminders).createForDate(ctx.organizationId, TOMORROW);
    expect(again).toEqual({ line: 0, email: 0, followUp: 0 });
    const lineRecords = await records({ channel: 'line' });
    expect(lineRecords).toHaveLength(1);
    expect((lineRecords[0]!.items as unknown[]).length).toBe(2);
    expect(lineRecords[0]!.dedupeKey).toMatch(new RegExp(`^reminder:${TOMORROW}:line:`));
    await worker().tick();
    expect(texts(line)).toHaveLength(1);
    expect(texts(line)[0]).toContain('พี่ เตือน');
    expect(texts(line)[0]).toContain('น้อง เตือน');
    expect(texts(email)).toHaveLength(1);
    expect(texts(email)[0]).toContain('ไม่มีไลน์ เตือน');
    expect(texts(email)[0]).not.toContain('พี่ เตือน');
    expect((await records({ status: 'staff_followup' })).map((r) => r.recipientId)).toEqual([d]);
    await ctx.app.get(Reminders).createForDate(ctx.organizationId, TOMORROW);
    await worker().tick();
    expect(texts(line)).toHaveLength(1);
  });

  it('only reminds confirmed bookings of non-cancelled sessions on that date', async () => {
    const whole = await tomorrowRun({ requireApproval: true });
    const per = await makeRun(ctx, s, { perSession: true, capacity: 5, closes: '2026-12-01T00:00:00.000Z', sessions: [session(TOMORROW, { capacity: 5 }), session('2026-10-19', { capacity: 5 })] });
    const [confirmed, pending, waiting, cancelled, onlyOtherDay] = await Promise.all(['ยืนยัน', 'รออนุมัติ', 'คิวรอ', 'ยกเลิก', 'วันอื่น'].map((n) => member(null, n, `${n.length}${n}@example.test`.replace(/[^\x00-\x7f]/g, 'x'))));
    const approved = await register(s, whole.runId, confirmed!);
    await s('post', `/api/registrations/${approved.body.registrationId}/review`, { approve: true });
    await register(s, whole.runId, pending!);
    const full = await tomorrowRun({ capacity: 1 });
    await register(s, full.runId, (await member(null, 'ตัวจริง', 'real@example.test')));
    await register(s, full.runId, waiting!);
    const gone = await register(s, per.runId, cancelled!, { sessionIds: [per.sessionIds[0]!] });
    await s('post', `/api/registrations/${gone.body.registrationId}/cancel`, { sessionIds: [per.sessionIds[0]!], reason: 'ไม่ไป', operationKey: key() });
    await register(s, per.runId, onlyOtherDay!, { sessionIds: [per.sessionIds[1]!] });
    await reset();
    await ctx.app.get(Reminders).createForDate(ctx.organizationId, TOMORROW);
    await worker().tick();
    const sent = texts(email).join('\n');
    expect(sent).toContain('ยืนยัน เตือน');
    for (const absent of ['รออนุมัติ เตือน', 'คิวรอ เตือน', 'ยกเลิก เตือน', 'วันอื่น เตือน']) expect(sent).not.toContain(absent);
    await s('post', `/api/sessions/${whole.sessionIds[0]}/cancel`, { reason: 'ฝน' });
    const none = await ctx.app.get(Reminders).createForDate(ctx.organizationId, TOMORROW);
    expect(none.email).toBe(0);
  });

  it('gives each member a separate email, with no sibling details, when LINE fails', async () => {
    const { runId } = await tomorrowRun();
    const a = await member('rem-split', 'คนแรก', 'first@example.test');
    const b = await member('rem-split', 'คนสอง', 'second@example.test');
    const c = await member('rem-split', 'คนสามไม่มีอีเมล');
    for (const m of [a, b, c]) await register(s, runId, m);
    await reset();
    line.reply(() => ({ status: 400 }));
    await ctx.app.get(Reminders).createForDate(ctx.organizationId, TOMORROW);
    await worker().tick();
    await worker().tick();
    const mails = email.requests.map((r) => ({ to: (r.json as { to: string[] }).to[0], text: (r.json as { text: string }).text }));
    expect(mails.map((m) => m.to).sort()).toEqual(['first@example.test', 'second@example.test']);
    const first = mails.find((m) => m.to === 'first@example.test')!;
    expect(first.text).toContain('คนแรก เตือน');
    expect(first.text).not.toMatch(/คนสอง|คนสาม/);
    const followUps = await records({ status: 'staff_followup', recipientId: c });
    expect(followUps).toHaveLength(1);
    expect(await records({ status: 'staff_followup', recipientId: { in: [a, b] } })).toHaveLength(0);
  });

  it('drops items that went stale after queueing, and skips an empty reminder', async () => {
    const { runId } = await tomorrowRun();
    const a = await member('rem-stale', 'เลิกไปแล้ว', 'x1@example.test');
    const b = await member('rem-stale', 'ยังไปอยู่', 'x2@example.test');
    const regA = await register(s, runId, a);
    await register(s, runId, b);
    await reset();
    await ctx.app.get(Reminders).createForDate(ctx.organizationId, TOMORROW);
    await s('post', `/api/registrations/${regA.body.registrationId}/cancel`, { reason: 'ไม่ไป', operationKey: key() });
    await worker().tick();
    expect(texts(line)).toHaveLength(1);
    expect(texts(line)[0]).toContain('ยังไปอยู่ เตือน');
    expect(texts(line)[0]).not.toContain('เลิกไปแล้ว');

    const run2 = await tomorrowRun();
    const c = await member('rem-moved', 'ย้ายบัญชี', 'moved@example.test');
    await register(s, run2.runId, c);
    await reset();
    await ctx.app.get(Reminders).createForDate(ctx.organizationId, TOMORROW);
    const other = await ctx.db.lineAccount.create({ data: { organizationId: ctx.organizationId, lineUserId: 'synthetic-other-owner' } });
    await ctx.db.member.update({ where: { id: c }, data: { lineAccountId: other.id } });
    await worker().tick();
    expect(line.requests.filter((r) => (r.json as { to: string }).to === 'synthetic-rem-moved')).toHaveLength(0);
    const skipped = await ctx.db.notification.findMany({ where: { organizationId: ctx.organizationId, kind: 'session.reminder', status: 'skipped' } });
    expect(skipped.length).toBeGreaterThan(0);
  });

  it('runs at 09:00 Bangkok once per day from the scheduler', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 5, closes: '2026-12-01T00:00:00.000Z', sessions: [session('2026-10-21')] });
    await register(s, runId, await member(null, 'ตั้งเวลา', 'timer@example.test'));
    await reset();
    const scheduler = ctx.app.get(Scheduler);
    const before = (await records()).length;
    await scheduler.tick(new Date('2026-10-20T01:59:00.000Z'));
    expect((await records()).length).toBe(before);
    await scheduler.tick(new Date('2026-10-20T02:00:00.000Z'));
    const after = (await records()).length;
    expect(after).toBe(before + 1);
    await scheduler.tick(new Date('2026-10-20T08:00:00.000Z'));
    expect((await records()).length).toBe(after);
    expect(await ctx.db.operationRecord.count({ where: { organizationId: ctx.organizationId, key: { startsWith: 'job:reminders:' } } })).toBeGreaterThanOrEqual(1);
  });
});
