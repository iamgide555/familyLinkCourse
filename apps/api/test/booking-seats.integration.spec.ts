import { createTestApp, type TestApp } from './test-app.js';
import { http, joinLine, key, lineHeader, login, makeRun, paperMember, register, serviceType, session, signin, staffCaller } from './helpers.js';

describe('seat reservation, approval and queues', () => {
  let ctx: TestApp;
  let s: ReturnType<typeof staffCaller>;
  let serviceId: string;
  const reservedIn = async (runId: string) => (await ctx.db.registration.count({ where: { runId, status: { in: ['submitted', 'confirmed'] } } }));
  const reservedSession = (sessionId: string) => ctx.db.registrationSession.count({ where: { sessionId, status: { in: ['submitted', 'confirmed'] } } });
  const members = (n: number, prefix: string) => Promise.all(Array.from({ length: n }, (_, i) => paperMember(ctx, `${prefix}${i}`, `19${70 + i}-01-01`)));
  beforeAll(async () => {
    ctx = await createTestApp();
    s = staffCaller(ctx, await login(ctx, 'seat-staff@example.test'));
    serviceId = await serviceType(ctx);
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('two simultaneous requests for one seat never overbook', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 1, waitlistEnabled: false });
    const [a, b] = await members(2, 'ที่สุดท้าย');
    const results = await Promise.all([register(s, runId, a!.id), register(s, runId, b!.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.code).toBe('RUN_FULL');
    expect(await reservedIn(runId)).toBe(1);
  });

  it('holds capacity under twenty competing requests, with and without a waitlist', async () => {
    const closed = await makeRun(ctx, s, { capacity: 3, waitlistEnabled: false });
    const open = await makeRun(ctx, s, { capacity: 3, waitlistEnabled: true });
    const people = await members(20, 'แข่ง');
    const [r1, r2] = await Promise.all([
      Promise.all(people.map((p) => register(s, closed.runId, p.id))),
      Promise.all(people.map((p) => register(s, open.runId, p.id))),
    ]);
    expect(r1.filter((r) => r.status === 201)).toHaveLength(3);
    expect(await reservedIn(closed.runId)).toBe(3);
    expect(r2.every((r) => r.status === 201)).toBe(true);
    expect(await reservedIn(open.runId)).toBe(3);
    const queue = await ctx.db.registration.findMany({ where: { runId: open.runId, status: 'waitlisted' }, orderBy: { queueSeq: 'asc' } });
    expect(queue).toHaveLength(17);
    expect(new Set(queue.map((q) => q.queueSeq)).size).toBe(17);
  });

  it('allows one registration per member even for concurrent submissions', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 5 });
    const [m] = await members(1, 'ส่งซ้ำ');
    const results = await Promise.all([1, 2, 3].map(() => register(s, runId, m!.id)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await ctx.db.registration.count({ where: { runId } })).toBe(1);
  });

  it('is idempotent for the same operation key: one booking, one snapshot, one notice', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 5 });
    const m = await paperMember(ctx, 'รหัสซ้ำ', '1971-01-01', 'idem@example.test');
    const op = key();
    const first = await register(s, runId, m.id, { operationKey: op });
    const second = await register(s, runId, m.id, { operationKey: op });
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body).toEqual(first.body);
    expect(await ctx.db.registrationSnapshot.count({ where: { registrationId: first.body.registrationId } })).toBe(1);
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, recipientId: m.id, kind: 'registration.confirmed' } })).toBe(1);
    expect((await register(s, runId, m.id, { operationKey: 'short' })).status).toBe(422);
  });

  it('keeps the reserved count when pending registrations are approved, and releases it on rejection', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 2, requireApproval: true });
    const [a, b, c] = await members(3, 'อนุมัติ');
    const ra = await register(s, runId, a!.id);
    const rb = await register(s, runId, b!.id);
    const rc = await register(s, runId, c!.id);
    expect(ra.body.outcomes[0].status).toBe('submitted');
    expect(rc.body.outcomes).toEqual([{ sessionId: null, status: 'waitlisted', queuePosition: 1 }]);
    const before = await reservedIn(runId);
    expect((await s('post', `/api/registrations/${ra.body.registrationId}/review`, { approve: true })).status).toBe(200);
    expect(await reservedIn(runId)).toBe(before);
    expect((await s('post', `/api/registrations/${ra.body.registrationId}/review`, { approve: true })).status).toBe(409);
    expect((await s('post', `/api/registrations/${rb.body.registrationId}/review`, { approve: false })).status).toBe(200);
    // The freed seat goes to the person waiting, as a pending (submitted) registration because approval is on.
    expect((await ctx.db.registration.findUniqueOrThrow({ where: { id: rc.body.registrationId } })).status).toBe('submitted');
    expect(await reservedIn(runId)).toBe(2);
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, recipientId: c!.id, kind: 'waitlist.promoted' } })).toBe(1);
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, recipientId: b!.id, kind: 'registration.rejected' } })).toBe(1);
  });

  it('keeps per-session outcomes independent', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { perSession: true, capacity: 1, requireApproval: true });
    const [a, b] = await members(2, 'รายวัน');
    expect((await register(s, runId, a!.id, { sessionIds: [sessionIds[0]!] })).body.outcomes[0].status).toBe('submitted');
    const mixed = await register(s, runId, b!.id, { sessionIds: [sessionIds[1]!, sessionIds[0]!] });
    expect(mixed.body.outcomes.map((o: { status: string }) => o.status)).toEqual(['waitlisted', 'submitted']);
    expect(mixed.body.outcomes[0].queuePosition).toBe(1);
    expect(await reservedSession(sessionIds[0]!)).toBe(1);
    expect(await reservedSession(sessionIds[1]!)).toBe(1);
    const reg = await ctx.db.registration.findUniqueOrThrow({ where: { id: mixed.body.registrationId } });
    expect(reg.status).toBeNull();
    // Approving one session leaves the sibling alone.
    expect((await s('post', `/api/registrations/${mixed.body.registrationId}/review`, { sessionIds: [sessionIds[1]!], approve: true })).status).toBe(200);
    const entries = await ctx.db.registrationSession.findMany({ where: { registrationId: mixed.body.registrationId }, orderBy: { sessionId: 'asc' } });
    expect(Object.fromEntries(entries.map((e) => [e.sessionId, e.status]))).toEqual({ [sessionIds[0]!]: 'waitlisted', [sessionIds[1]!]: 'confirmed' });
    expect((await s('post', `/api/registrations/${mixed.body.registrationId}/review`, { sessionIds: [], approve: true })).status).toBe(422);
    expect((await register(s, runId, b!.id, { sessionIds: [] })).status).toBe(422);
    expect((await register(s, runId, b!.id, { sessionIds: ['00000000-0000-4000-8000-000000000000'] })).status).toBe(422);
  });

  it('lets an unsigned member register', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 5 });
    const memberId = await joinLine(ctx, 'seat-unsigned', 'ยังไม่ลงนาม', 'ทดสอบ', '1985-05-05', serviceId);
    expect((await ctx.db.member.findUniqueOrThrow({ where: { id: memberId } })).signedFormAt).toBeNull();
    const response = await http(ctx).post(`/api/member/me/${memberId}/registrations`).set(lineHeader('seat-unsigned')).send({ runId, sessionIds: [], answers: {}, operationKey: key() });
    expect(response.status).toBe(201);
    expect(response.body.outcomes[0].status).toBe('confirmed');
  });

  it('keeps a member to their own LINE account and refuses browser-invite or foreign contexts', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 5 });
    const memberId = await joinLine(ctx, 'seat-owner', 'เจ้าของ', 'สิทธิ์', '1986-06-06', serviceId);
    const body = { runId, sessionIds: [], answers: {}, operationKey: key() };
    expect((await http(ctx).post(`/api/member/me/${memberId}/registrations`).send(body)).status).toBe(401);
    expect((await http(ctx).post(`/api/member/me/${memberId}/registrations`).set(lineHeader('seat-foreign')).send(body)).status).toBe(404);
    expect((await http(ctx).post(`/api/member/me/${memberId}/registrations`).set(lineHeader('seat-owner')).send({ ...body, memberId: 'ignored' })).status).toBe(201);
  });

  it('enforces registration open and close times to the instant (Bangkok)', async () => {
    // Fixed clock: 2026-10-17T03:00:00Z.
    const opens = await makeRun(ctx, s, { capacity: 5, opens: '2026-10-17T03:00:01.000Z' });
    const [m] = await members(1, 'เวลา');
    const early = await register(s, opens.runId, m!.id);
    expect([early.status, early.body.code]).toEqual([409, 'REGISTRATION_NOT_OPEN']);
    ctx.clock.advance(1000);
    expect((await register(s, opens.runId, m!.id)).status).toBe(201);
    const closes = await makeRun(ctx, s, { capacity: 5, closes: '2026-10-17T03:00:02.000Z' });
    const [n] = await members(1, 'ปิดรับ');
    expect((await register(s, closes.runId, n!.id)).status).toBe(201);
    const [o] = await members(1, 'ปิดรับสอง');
    ctx.clock.advance(1000);
    const late = await register(s, closes.runId, o!.id);
    expect([late.status, late.body.code]).toEqual([409, 'REGISTRATION_CLOSED']);
    ctx.clock.set('2026-10-17T03:00:00.000Z');
  });

  it('closes one day before the first session when no close time is set', async () => {
    const run = await makeRun(ctx, s, { capacity: 5, sessions: [session('2026-10-20')] });
    const [m, n] = await members(2, 'ไม่มีเวลาปิด');
    ctx.clock.set('2026-10-19T01:59:59.000Z');
    const later = staffCaller(ctx, await signin(ctx, 'seat-staff@example.test'));
    expect((await register(later, run.runId, m!.id)).status).toBe(201);
    ctx.clock.set('2026-10-19T02:00:00.000Z');
    expect((await register(later, run.runId, n!.id)).body.code).toBe('REGISTRATION_CLOSED');
    ctx.clock.set('2026-10-17T03:00:00.000Z');
    s = staffCaller(ctx, await signin(ctx, 'seat-staff@example.test'));
  });

  it('does not let a member re-register after staff rejected them, but staff can', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 5, requireApproval: true });
    const memberId = await joinLine(ctx, 'seat-rejected', 'ถูกปฏิเสธ', 'ทดสอบ', '1987-07-07', serviceId);
    const first = await http(ctx).post(`/api/member/me/${memberId}/registrations`).set(lineHeader('seat-rejected')).send({ runId, sessionIds: [], answers: {}, operationKey: key() });
    await s('post', `/api/registrations/${first.body.registrationId}/review`, { approve: false });
    const again = await http(ctx).post(`/api/member/me/${memberId}/registrations`).set(lineHeader('seat-rejected')).send({ runId, sessionIds: [], answers: {}, operationKey: key() });
    expect([again.status, again.body.code]).toEqual([409, 'REGISTRATION_REJECTED']);
    expect((await register(s, runId, memberId)).status).toBe(201);
  });

  it('blocks staff from approving their own or their family’s registrations', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 5, requireApproval: true });
    const own = await joinLine(ctx, 'seat-staff-fam', 'เจ้าหน้าที่', 'เอง', '1980-08-08', serviceId);
    const sibling = await joinLine(ctx, 'seat-staff-fam', 'ลูก', 'เจ้าหน้าที่', '2012-08-08', serviceId, { registeringFor: 'another', relationship: 'บุตร' });
    const selfStaff = staffCaller(ctx, await login(ctx, 'seat-self@example.test', 'staff', own));
    const mine = await register(s, runId, sibling);
    const denied = await selfStaff('post', `/api/registrations/${mine.body.registrationId}/review`, { approve: true });
    expect([denied.status, denied.body.code]).toEqual([403, 'SELF_REVIEW_FORBIDDEN']);
    expect((await s('post', `/api/registrations/${mine.body.registrationId}/review`, { approve: true })).status).toBe(200);
  });
});
