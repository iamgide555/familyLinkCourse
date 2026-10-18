import { createTestApp, type TestApp } from './test-app.js';
import { key, login, makeRun, paperMember, register, session, staffCaller } from './helpers.js';

describe('session attendance', () => {
  let ctx: TestApp;
  let s: ReturnType<typeof staffCaller>;
  const mark = (sessionId: string, memberId: string, status: string) => s('post', `/api/sessions/${sessionId}/attendance`, { memberId, status });
  const roster = async (sessionId: string) => (await s('get', `/api/sessions/${sessionId}/roster`)).body;
  const open = '2026-12-01T00:00:00.000Z';
  beforeAll(async () => { ctx = await createTestApp(); s = staffCaller(ctx, await login(ctx, 'att-staff@example.test')); });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('keeps unmarked distinct from absent', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 5, closes: open });
    const [a, b, c] = [await paperMember(ctx, 'มาเรียน'), await paperMember(ctx, 'ไม่มา'), await paperMember(ctx, 'ยังไม่เช็ค')];
    for (const m of [a, b, c]) await register(s, runId, m.id);
    expect((await mark(sessionIds[0]!, a.id, 'present')).status).toBe(200);
    expect((await mark(sessionIds[0]!, b.id, 'absent')).status).toBe(200);
    const r = await roster(sessionIds[0]!);
    expect({ present: r.present, absent: r.absent, unmarked: r.unmarked, registered: r.registered }).toEqual({ present: 1, absent: 1, unmarked: 1, registered: 3 });
    expect(r.rows.find((x: { memberId: string }) => x.memberId === c.id).attendance).toBeNull();
    expect((await roster(sessionIds[1]!)).unmarked).toBe(3);
    expect((await s('delete', `/api/sessions/${sessionIds[0]}/attendance/${a.id}`)).status).toBe(200);
    expect((await roster(sessionIds[0]!)).unmarked).toBe(2);
    expect((await mark(sessionIds[0]!, a.id, 'maybe')).status).toBe(422);
  });

  it('refuses waitlisted, pending and unregistered people', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 1, requireApproval: true, closes: open });
    const [pending, waiting, stranger] = [await paperMember(ctx, 'รออนุมัติ'), await paperMember(ctx, 'รอคิว'), await paperMember(ctx, 'ไม่ได้ลงทะเบียน')];
    const rp = await register(s, runId, pending.id);
    await register(s, runId, waiting.id);
    for (const m of [pending, waiting, stranger]) { const r = await mark(sessionIds[0]!, m.id, 'present'); expect([m.firstName, r.status, r.body.code]).toEqual([m.firstName, 409, 'NOT_CONFIRMED']); }
    expect((await roster(sessionIds[0]!)).rows).toEqual([]);
    await s('post', `/api/registrations/${rp.body.registrationId}/review`, { approve: true });
    expect((await mark(sessionIds[0]!, pending.id, 'present')).status).toBe(200);
  });

  it('counts per-session confirmation independently', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { perSession: true, capacity: 1, closes: open });
    const [a, b] = [await paperMember(ctx, 'วันหนึ่ง'), await paperMember(ctx, 'วันสอง')];
    await register(s, runId, a.id, { sessionIds: [sessionIds[0]!] });
    await register(s, runId, b.id, { sessionIds: [sessionIds[1]!] });
    expect((await mark(sessionIds[1]!, a.id, 'present')).status).toBe(409);
    expect((await mark(sessionIds[0]!, a.id, 'present')).status).toBe(200);
    expect((await roster(sessionIds[0]!)).rows.map((x: { memberId: string }) => x.memberId)).toEqual([a.id]);
    expect((await roster(sessionIds[1]!)).rows.map((x: { memberId: string }) => x.memberId)).toEqual([b.id]);
  });

  it('rejects cancelled sessions and runs', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 5, closes: open });
    const m = await paperMember(ctx, 'ยกเลิกวัน');
    await register(s, runId, m.id);
    await s('post', `/api/sessions/${sessionIds[0]}/cancel`, { reason: 'ฝนตก' });
    const r = await mark(sessionIds[0]!, m.id, 'present');
    expect([r.status, r.body.code]).toEqual([409, 'SESSION_CANCELLED']);
    expect((await roster(sessionIds[0]!)).sessionStatus).toBe('cancelled');
    expect((await mark(sessionIds[1]!, m.id, 'present')).status).toBe(200);
    await s('post', `/api/runs/${runId}/cancel`, { reason: 'งดทั้งรอบ' });
    expect((await mark(sessionIds[1]!, m.id, 'absent')).status).toBe(409);
  });

  it('keeps already-recorded attendance when a whole-run registration is cancelled later', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 5, closes: open });
    const m = await paperMember(ctx, 'ถอนตัวทีหลัง');
    const reg = await register(s, runId, m.id);
    await mark(sessionIds[0]!, m.id, 'present');
    await s('post', `/api/registrations/${reg.body.registrationId}/cancel`, { reason: 'ย้ายบ้าน', operationKey: key() });
    const row = (await roster(sessionIds[0]!)).rows.find((x: { memberId: string }) => x.memberId === m.id);
    expect(row).toMatchObject({ attendance: 'present', bookingStatus: 'cancelled' });
    expect((await roster(sessionIds[0]!)).registered).toBe(0);
    expect((await mark(sessionIds[0]!, m.id, 'absent')).status).toBe(409);
    const view = (await s('get', `/api/runs/${runId}/registrations`)).body.items[0];
    expect(view.entries[0].status).toBe('cancelled');
  });

  it('lists the sessions held on a date and logs roster views', async () => {
    const { sessionIds } = await makeRun(ctx, s, { capacity: 5, sessions: [session('2027-03-04'), session('2027-03-05')] });
    const day = await s('get', '/api/attendance/sessions?date=2027-03-04');
    expect(day.body.items.map((x: { sessionId: string }) => x.sessionId)).toContain(sessionIds[0]);
    expect(day.body.items.map((x: { sessionId: string }) => x.sessionId)).not.toContain(sessionIds[1]);
    expect((await s('get', '/api/attendance/sessions?date=bad')).status).toBe(422);
    await roster(sessionIds[0]!);
    expect(await ctx.db.auditLog.count({ where: { organizationId: ctx.organizationId, action: 'attendance.roster', entityId: sessionIds[0]! } })).toBe(1);
  });
});
