import { createTestApp, type TestApp } from './test-app.js';
import { NotificationWorker } from '../src/notifications/notification-worker.js';
import { Reminders } from '../src/notifications/reminders.service.js';
import { joinLine, key, login, makeRun, paperMember, register, serviceType, staffCaller } from './helpers.js';

type CallItem = { id: string; kind: string; memberId: string; memberName: string; phone: string; text: string; reason: string };
type Group = { runId: string | null; courseName: string; batchName: string; nextSessionDate: string | null; items: CallItem[] };

describe('call list for members staff can only reach by phone', () => {
  let ctx: TestApp;
  let worker: NotificationWorker;
  let s: ReturnType<typeof staffCaller>;
  let serviceId: string;
  let seq = 0;
  /** A paper member with a phone number and neither LINE nor email. */
  const phoneOnly = async (name: string) => {
    const m = await paperMember(ctx, name, `1960-02-${10 + seq++}`);
    await ctx.db.member.update({ where: { id: m.id }, data: { phoneMobile: `08100000${String(seq).padStart(2, '0')}` } });
    return m.id;
  };
  const callList = async () => (await s('get', '/api/notifications/call-list')).body.groups as Group[];
  const flush = async () => { while (await worker.tick()) { /* drain */ } };
  const mine = (groups: Group[], runId: string) => groups.find((g) => g.runId === runId)?.items ?? [];

  beforeAll(async () => {
    ctx = await createTestApp();
    worker = ctx.app.get(NotificationWorker);
    s = staffCaller(ctx, await login(ctx, 'call-staff@example.test'));
    serviceId = await serviceType(ctx);
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('lists a waitlist promotion with the message text, phone and run details', async () => {
    const first = await phoneOnly('ก่อน');
    const second = await phoneOnly('หลัง');
    const { runId } = await makeRun(ctx, s, { capacity: 1 });
    const r1 = await register(s, runId, first);
    expect((await register(s, runId, second)).body.outcomes[0].status).toBe('waitlisted');
    await flush();
    expect(mine(await callList(), runId)).toHaveLength(0); // staff just registered them; nothing to call about yet
    await s('post', `/api/registrations/${r1.body.registrationId}/cancel`, { reason: 'ทดสอบ', operationKey: key() });
    await flush();
    const items = mine(await callList(), runId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'waitlist.promoted', memberId: second, memberName: 'หลัง ทดสอบ', reason: 'no_channel' });
    expect(items[0]!.phone).toMatch(/^0810000/);
    expect(items[0]!.text).toContain('หลัง ทดสอบ');
    const group = (await callList()).find((g) => g.runId === runId)!;
    expect(group.batchName).toBe('รุ่นทดสอบ');
    expect(group.nextSessionDate).toBe('2026-11-10');
  });

  it('lists a session cancellation and a run cancellation', async () => {
    const a = await phoneOnly('ยกเลิกวัน');
    const b = await phoneOnly('ยกเลิกรอบ');
    const one = await makeRun(ctx, s, { capacity: 3 });
    const two = await makeRun(ctx, s, { capacity: 3 });
    await register(s, one.runId, a);
    await register(s, two.runId, b);
    expect((await s('post', `/api/sessions/${one.sessionIds[0]}/cancel`, { reason: 'ฝนตกหนัก' })).status).toBe(200);
    expect((await s('post', `/api/runs/${two.runId}/cancel`, { reason: 'วิทยากรป่วย' })).status).toBe(200);
    await flush();
    const day = mine(await callList(), one.runId);
    expect(day.map((i) => i.kind)).toEqual(['session.cancelled']);
    expect(day[0]!.text).toContain('ยกเลิก');
    const whole = mine(await callList(), two.runId);
    expect(whole.map((i) => i.kind)).toEqual(['run.cancelled']);
    expect(whole[0]!.memberId).toBe(b);
  });

  it("lists tomorrow's reminder", async () => {
    const a = await phoneOnly('เตือนพรุ่งนี้');
    const { runId } = await makeRun(ctx, s, { capacity: 3 });
    await register(s, runId, a);
    await ctx.app.get(Reminders).createForDate(ctx.organizationId, '2026-11-10');
    const items = mine(await callList(), runId);
    expect(items.map((i) => i.kind)).toEqual(['session.reminder']);
    expect(items[0]!.text).toContain('พรุ่งนี้');
  });

  it('leaves out members who were reached by LINE', async () => {
    const linked = await joinLine(ctx, 'call-line-1', 'มีไลน์', 'ทดสอบ', '1970-03-03', serviceId);
    const { runId } = await makeRun(ctx, s, { capacity: 3 });
    await register(s, runId, linked);
    await flush();
    expect(mine(await callList(), runId)).toHaveLength(0);
  });

  it('drops a notice that no longer matches reality, and drops it once staff mark it called', async () => {
    const a = await phoneOnly('คนแรก');
    const b = await phoneOnly('เปลี่ยนใจ');
    const c = await phoneOnly('โทรแล้ว');
    const { runId } = await makeRun(ctx, s, { capacity: 1 });
    const ra = await register(s, runId, a);
    const rb = await register(s, runId, b);
    await register(s, runId, c);
    await s('post', `/api/registrations/${ra.body.registrationId}/cancel`, { reason: 'ทดสอบ', operationKey: key() }); // promotes b
    await s('post', `/api/registrations/${rb.body.registrationId}/cancel`, { reason: 'ทดสอบ', operationKey: key() }); // promotes c
    await flush();
    const items = mine(await callList(), runId);
    expect(items.map((i) => i.memberId)).toEqual([c]);
    expect((await s('post', `/api/notifications/${items[0]!.id}/resolve`, {})).status).toBe(200);
    expect(mine(await callList(), runId)).toHaveLength(0);
  });

  it('marks registrations of members with no LINE and no email as phone only', async () => {
    const a = await phoneOnly('โทรอย่างเดียว');
    const withEmail = await paperMember(ctx, 'มีอีเมล', '1961-01-01', 'has@example.test');
    const linked = await joinLine(ctx, 'call-line-2', 'ไลน์', 'ทดสอบ', '1971-04-04', serviceId);
    const { runId } = await makeRun(ctx, s, { capacity: 5 });
    for (const id of [a, withEmail.id, linked]) await register(s, runId, id);
    const items = (await s('get', `/api/runs/${runId}/registrations`)).body.items as Array<{ memberId: string; contact: string }>;
    const contact = (id: string) => items.find((i) => i.memberId === id)!.contact;
    expect([contact(a), contact(withEmail.id), contact(linked)]).toEqual(['phone_only', 'email', 'line']);
  });
});
