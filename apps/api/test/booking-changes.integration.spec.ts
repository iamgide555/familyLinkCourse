import { createTestApp, type TestApp } from './test-app.js';
import { http, joinLine, key, lineHeader, login, makeRun, paperMember, register, serviceType, session, signin, staffCaller } from './helpers.js';

const NOW = '2026-10-17T03:00:00.000Z';
describe('cancellation, rescheduling, promotion and capacity changes', () => {
  let ctx: TestApp;
  let s: ReturnType<typeof staffCaller>;
  let serviceId: string;
  const staffEmail = 'chg-staff@example.test';
  const people = (n: number, prefix: string) => Promise.all(Array.from({ length: n }, (_, i) => paperMember(ctx, `${prefix}${i}`, `19${60 + i}-02-02`)));
  const status = async (registrationId: string) => (await ctx.db.registration.findUniqueOrThrow({ where: { id: registrationId } })).status;
  const cancel = (registrationId: string, extra: object = {}) => s('post', `/api/registrations/${registrationId}/cancel`, { reason: 'ทดสอบ', operationKey: key(), ...extra });
  const goTo = async (instant: string) => { ctx.clock.set(instant); s = staffCaller(ctx, await signin(ctx, staffEmail)); };
  beforeAll(async () => {
    ctx = await createTestApp();
    s = staffCaller(ctx, await login(ctx, staffEmail));
    serviceId = await serviceType(ctx);
  });
  afterEach(async () => { if (ctx.clock.now().toISOString() !== NOW) await goTo(NOW); });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('promotes the queue in the same transaction as a cancellation', async () => {
    const plain = await makeRun(ctx, s, { capacity: 1 });
    const [a, b] = await people(2, 'คิวปกติ');
    const ra = await register(s, plain.runId, a!.id);
    const rb = await register(s, plain.runId, b!.id);
    expect(rb.body.outcomes[0].status).toBe('waitlisted');
    expect((await cancel(ra.body.registrationId)).status).toBe(200);
    expect(await status(rb.body.registrationId)).toBe('confirmed');
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, recipientId: b!.id, kind: 'waitlist.promoted' } })).toBe(1);
    const approval = await makeRun(ctx, s, { capacity: 1, requireApproval: true });
    const [c, d] = await people(2, 'คิวอนุมัติ');
    const rc = await register(s, approval.runId, c!.id);
    const rd = await register(s, approval.runId, d!.id);
    await cancel(rc.body.registrationId);
    expect(await status(rd.body.registrationId)).toBe('submitted');
    expect((await cancel(rc.body.registrationId)).status).toBe(409);
  });

  it('fills two simultaneously freed seats once each, in order', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 2 });
    const [a, b, c, d, e] = await people(5, 'ปล่อยพร้อมกัน');
    const [ra, rb] = [await register(s, runId, a!.id), await register(s, runId, b!.id)];
    const [rc, rd, re] = [await register(s, runId, c!.id), await register(s, runId, d!.id), await register(s, runId, e!.id)];
    await Promise.all([cancel(ra.body.registrationId), cancel(rb.body.registrationId)]);
    expect(await status(rc.body.registrationId)).toBe('confirmed');
    expect(await status(rd.body.registrationId)).toBe('confirmed');
    expect(await status(re.body.registrationId)).toBe('waitlisted');
    expect(await ctx.db.registration.count({ where: { runId, status: { in: ['submitted', 'confirmed'] } } })).toBe(2);
  });

  it('stops automatic promotion at the cutoff, then promotes by hand with a recorded contact reason', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 1, closes: '2026-10-20T00:00:00.000Z' });
    const [a, b, c] = await people(3, 'เลยกำหนด');
    const ra = await register(s, runId, a!.id);
    const rb = await register(s, runId, b!.id);
    const rc = await register(s, runId, c!.id);
    await goTo('2026-10-19T23:59:59.000Z');
    expect((await cancel(ra.body.registrationId)).status).toBe(200);
    expect(await status(rb.body.registrationId)).toBe('confirmed');
    await goTo('2026-10-20T00:00:00.000Z');
    expect((await cancel(rb.body.registrationId)).status).toBe(200);
    expect(await status(rc.body.registrationId)).toBe('waitlisted');
    expect(await ctx.db.registration.count({ where: { runId, status: { in: ['submitted', 'confirmed'] } } })).toBe(0);
    expect((await s('post', `/api/registrations/${rc.body.registrationId}/promote`, { reason: ' ' })).status).toBe(422);
    const promoted = await s('post', `/api/registrations/${rc.body.registrationId}/promote`, { reason: 'โทรหาแล้ว ยืนยันว่ามา' });
    expect(promoted.status).toBe(200);
    expect(await status(rc.body.registrationId)).toBe('confirmed');
    const event = await ctx.db.registrationEvent.findFirstOrThrow({ where: { registrationId: rc.body.registrationId, kind: 'promote_manual' } });
    expect(JSON.stringify(event)).not.toContain('โทรหาแล้ว');
    const [d] = await people(1, 'มาทีหลัง');
    const late = await register(s, runId, d!.id);
    expect([late.status, late.body.code]).toEqual([409, 'REGISTRATION_CLOSED']);
  });

  it('refuses a manual promotion when no seat is free or the member is not waiting', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 1 });
    const [a, b] = await people(2, 'ไม่ว่าง');
    const ra = await register(s, runId, a!.id);
    const rb = await register(s, runId, b!.id);
    const noSeat = await s('post', `/api/registrations/${rb.body.registrationId}/promote`, { reason: 'ทดสอบ' });
    expect([noSeat.status, noSeat.body.code]).toEqual([409, 'NO_SEAT']);
    const notWaiting = await s('post', `/api/registrations/${ra.body.registrationId}/promote`, { reason: 'ทดสอบ' });
    expect([notWaiting.status, notWaiting.body.code]).toEqual([409, 'NOT_WAITLISTED']);
  });

  it('never lets capacity fall below reserved seats, and fills the queue when it grows', async () => {
    const whole = await makeRun(ctx, s, { capacity: 2 });
    const [a, b, c, d] = await people(4, 'ความจุ');
    await register(s, whole.runId, a!.id);
    await register(s, whole.runId, b!.id);
    const rc = await register(s, whole.runId, c!.id);
    const rd = await register(s, whole.runId, d!.id);
    const low = await s('patch', `/api/runs/${whole.runId}`, { capacity: 1 });
    expect([low.status, low.body.code]).toEqual([409, 'CAPACITY_BELOW_RESERVED']);
    expect((await s('patch', `/api/runs/${whole.runId}`, { capacity: 2 })).status).toBe(200);
    const grown = await s('patch', `/api/runs/${whole.runId}`, { capacity: 3 });
    expect(grown.status).toBe(200);
    expect(await status(rc.body.registrationId)).toBe('confirmed');
    expect(await status(rd.body.registrationId)).toBe('waitlisted');
    expect(grown.body.reserved).toBe(3);
    expect(grown.body.waiting).toBe(1);

    const per = await makeRun(ctx, s, { perSession: true, capacity: 1 });
    const [e, f] = await people(2, 'ความจุรายวัน');
    await register(s, per.runId, e!.id, { sessionIds: [per.sessionIds[0]!] });
    const rf = await register(s, per.runId, f!.id, { sessionIds: [per.sessionIds[0]!] });
    expect((await s('patch', `/api/sessions/${per.sessionIds[0]}`, { capacity: 0 })).status).toBe(422);
    expect((await s('patch', `/api/sessions/${per.sessionIds[0]}`, { capacity: 2 })).status).toBe(200);
    const entry = await ctx.db.registrationSession.findFirstOrThrow({ where: { registrationId: rf.body.registrationId } });
    expect(entry.status).toBe('confirmed');
    const floor = await s('patch', `/api/sessions/${per.sessionIds[0]}`, { capacity: 1 });
    expect([floor.status, floor.body.code]).toEqual([409, 'CAPACITY_BELOW_RESERVED']);
  });

  it('keeps whole-run seats when one session is cancelled and notifies everyone registered or waiting', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 1 });
    const [a, b] = await people(2, 'ยกเลิกวันเรียน');
    const ra = await register(s, runId, a!.id);
    const rb = await register(s, runId, b!.id);
    const before = await ctx.db.registration.count({ where: { runId, status: { in: ['submitted', 'confirmed'] } } });
    const response = await s('post', `/api/sessions/${sessionIds[0]}/cancel`, { reason: 'ฝนตกหนัก' });
    expect(response.status).toBe(200);
    expect(response.body.sessions[0].status).toBe('cancelled');
    expect(await ctx.db.registration.count({ where: { runId, status: { in: ['submitted', 'confirmed'] } } })).toBe(before);
    expect(await status(ra.body.registrationId)).toBe('confirmed');
    expect(await status(rb.body.registrationId)).toBe('waitlisted');
    const notes = await ctx.db.notification.findMany({ where: { organizationId: ctx.organizationId, kind: 'session.cancelled', recipientId: { in: [a!.id, b!.id] } } });
    expect(notes).toHaveLength(2);
    expect(JSON.stringify(notes)).not.toContain('ฝนตกหนัก');
    expect((await s('post', `/api/sessions/${sessionIds[0]}/cancel`, { reason: 'อีกครั้ง' })).status).toBe(409);
    expect((await s('post', `/api/sessions/${sessionIds[1]}/cancel`, { reason: '' })).status).toBe(422);
  });

  it('cancels only the entries of one session in per-session mode, without promotion', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { perSession: true, capacity: 1 });
    const [a, b] = await people(2, 'ยกเลิกรายวัน');
    const ra = await register(s, runId, a!.id, { sessionIds: sessionIds });
    const rb = await register(s, runId, b!.id, { sessionIds: [sessionIds[0]!] });
    expect(rb.body.outcomes[0].status).toBe('waitlisted');
    expect((await s('post', `/api/sessions/${sessionIds[0]}/cancel`, { reason: 'วิทยากรป่วย' })).status).toBe(200);
    const entries = await ctx.db.registrationSession.findMany({ where: { registration: { runId } } });
    const by = (reg: string, sid: string) => entries.find((e) => e.registrationId === reg && e.sessionId === sid)!;
    expect(by(ra.body.registrationId, sessionIds[0]!)).toMatchObject({ status: 'cancelled', cancelReason: 'organization' });
    expect(by(rb.body.registrationId, sessionIds[0]!)).toMatchObject({ status: 'cancelled', cancelReason: 'organization' });
    expect(by(ra.body.registrationId, sessionIds[1]!).status).toBe('confirmed');
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, kind: 'session.cancelled', recipientId: { in: [a!.id, b!.id] } } })).toBe(2);
    const [c] = await people(1, 'หลังยกเลิก');
    const late = await register(s, runId, c!.id, { sessionIds: [sessionIds[0]!] });
    expect([late.status, late.body.code]).toEqual([409, 'SESSION_CANCELLED']);
  });

  it('cancels a whole run: every booking, waiting entries included, with notices', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 1 });
    const [a, b] = await people(2, 'ยกเลิกรอบ');
    const ra = await register(s, runId, a!.id);
    const rb = await register(s, runId, b!.id);
    const done = await s('post', `/api/runs/${runId}/cancel`, { reason: 'งดจัด' });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('cancelled');
    for (const id of [ra.body.registrationId, rb.body.registrationId]) {
      expect(await ctx.db.registration.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'cancelled', cancelReason: 'organization' });
    }
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, kind: 'run.cancelled', recipientId: { in: [a!.id, b!.id] } } })).toBe(2);
    expect((await register(s, runId, a!.id)).status).toBe(409);
    expect((await s('post', `/api/runs/${runId}/cancel`, { reason: 'ซ้ำ' })).status).toBe(409);
    expect((await s('patch', `/api/runs/${runId}`, { location: 'ใหม่' })).status).toBe(409);
  });

  it('applies the self-cancel deadline to the exact instant, with staff able to cancel afterwards', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 5, cancelDays: 7 });
    const memberId = await joinLine(ctx, 'chg-dl', 'หมดเขต', 'ยกเลิก', '1988-08-08', serviceId);
    const reg = await register(s, runId, memberId);
    const mine = () => http(ctx).post(`/api/member/registrations/${reg.body.registrationId}/cancel`).set(lineHeader('chg-dl'));
    // First session 2026-11-10 09:00 Bangkok = 02:00Z; deadline 7 days earlier.
    await goTo('2026-11-03T02:00:00.000Z');
    const late = await mine().send({ operationKey: key() });
    expect([late.status, late.body.code]).toEqual([403, 'CANCEL_DEADLINE_PASSED']);
    expect((await http(ctx).post(`/api/member/registrations/${reg.body.registrationId}/cancel`).set(lineHeader('chg-other')).send({ operationKey: key() })).status).toBe(404);
    await goTo('2026-11-03T01:59:59.999Z');
    const view = (await http(ctx).get('/api/member/registrations').set(lineHeader('chg-dl'))).body.items[0];
    expect(view.canSelfCancel).toBe(true);
    expect(view.cancelDeadline).toBe('2026-11-03T02:00:00.000Z');
    expect((await mine().send({ operationKey: key() })).status).toBe(200);
    expect(await status(reg.body.registrationId)).toBe('cancelled');
    await goTo('2026-11-05T00:00:00.000Z');
    const rejoin = await register(s, runId, memberId);
    expect(rejoin.status).toBe(201);
    expect(rejoin.body.registrationId).toBe(reg.body.registrationId);
    expect(await status(reg.body.registrationId)).toBe('confirmed');
  });

  it('lets a member drop some sessions and keep the others before the one run-wide deadline', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { perSession: true, capacity: 5, cancelDays: 7 });
    const memberId = await joinLine(ctx, 'chg-part', 'ยกเลิกบางวัน', 'ทดสอบ', '1989-09-09', serviceId);
    const reg = await register(s, runId, memberId, { sessionIds });
    const response = await http(ctx).post(`/api/member/registrations/${reg.body.registrationId}/cancel`).set(lineHeader('chg-part')).send({ sessionIds: [sessionIds[1]], operationKey: key() });
    expect(response.status).toBe(200);
    const entries = await ctx.db.registrationSession.findMany({ where: { registrationId: reg.body.registrationId } });
    expect(Object.fromEntries(entries.map((e) => [e.sessionId, e.status]))).toEqual({ [sessionIds[0]!]: 'confirmed', [sessionIds[1]!]: 'cancelled' });
    const none = await http(ctx).post(`/api/member/registrations/${reg.body.registrationId}/cancel`).set(lineHeader('chg-part')).send({ sessionIds: [], operationKey: key() });
    expect(none.status).toBe(422);
  });

  it('extends the self-cancel window after a reschedule but caps it at the new start', async () => {
    const run = await makeRun(ctx, s, { perSession: true, capacity: 5, cancelDays: 7 });
    const [a] = await people(1, 'เลื่อนวัน');
    await register(s, run.runId, a!.id, { sessionIds: run.sessionIds });
    // Base deadline: 2026-11-03T02:00Z. Changed on 2026-10-30T03:00Z: +7 days beats it.
    await goTo('2026-10-30T03:00:00.000Z');
    const moved = await s('post', `/api/sessions/${run.sessionIds[1]}/reschedule`, { date: '2026-11-30', startTime: '09:00', endTime: '12:00' });
    expect(moved.status).toBe(200);
    const sessions = moved.body.sessions as Array<{ id: string; cancelDeadline: string; date: string; dayNo: number }>;
    expect(sessions.find((x) => x.id === run.sessionIds[1])!.cancelDeadline).toBe('2026-11-06T03:00:00.000Z');
    expect(sessions.find((x) => x.id === run.sessionIds[0])!.cancelDeadline).toBe('2026-11-03T02:00:00.000Z');
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, kind: 'session.rescheduled', recipientId: a!.id } })).toBe(1);
    // A new start inside the 7-day window caps the deadline at that start.
    await goTo('2026-11-02T00:00:00.000Z');
    const capped = await s('post', `/api/sessions/${run.sessionIds[0]}/reschedule`, { date: '2026-11-05', startTime: '09:00', endTime: '12:00' });
    expect((capped.body.sessions as Array<{ id: string; cancelDeadline: string }>).find((x) => x.id === run.sessionIds[0])!.cancelDeadline).toBe('2026-11-05T02:00:00.000Z');
    expect((await s('post', `/api/sessions/${run.sessionIds[0]}/reschedule`, { date: '2026-11-05', startTime: '09:00', endTime: '12:00' })).status).toBe(422);
  });

  it('keeps an existing later deadline when rescheduling', async () => {
    const run = await makeRun(ctx, s, { capacity: 5, cancelDays: 3, sessions: [session('2026-12-20')] });
    const [a] = await people(1, 'กำหนดเดิมยาว');
    await register(s, run.runId, a!.id);
    await goTo('2026-11-01T00:00:00.000Z');
    // Moving the session earlier would shorten the window; the earlier, later deadline is preserved.
    const moved = await s('post', `/api/sessions/${run.sessionIds[0]}/reschedule`, { date: '2026-12-18', startTime: '09:00', endTime: '12:00' });
    expect(moved.body.cancelDeadline).toBe('2026-12-17T02:00:00.000Z');
    expect(moved.body.sessions[0].cancelDeadline).toBe('2026-12-17T02:00:00.000Z');
  });

  it('whole-run members may still withdraw after a reschedule extends the window', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 5, cancelDays: 7 });
    const memberId = await joinLine(ctx, 'chg-wr', 'ถอนตัว', 'หลังเลื่อน', '1990-10-10', serviceId);
    const reg = await register(s, runId, memberId);
    await goTo('2026-11-02T03:00:00.000Z');
    await s('post', `/api/sessions/${sessionIds[1]}/reschedule`, { date: '2026-11-20', startTime: '09:00', endTime: '12:00' });
    await goTo('2026-11-05T00:00:00.000Z');
    expect((await http(ctx).post(`/api/member/registrations/${reg.body.registrationId}/cancel`).set(lineHeader('chg-wr')).send({ operationKey: key() })).status).toBe(200);
  });
});
