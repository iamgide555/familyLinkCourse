import { createTestApp, type TestApp } from './test-app.js';
import { Walkins } from '../src/bookings/walkins.service.js';
import { http, joinLine, key, lineHeader, login, makeRun, paperMember, register, serviceType, session, staffCaller, validCitizenId, validBirthDate } from './helpers.js';

describe('walk-in intake, booking and attendance in one operation', () => {
  let ctx: TestApp;
  let s: ReturnType<typeof staffCaller>;
  let serviceId: string;
  const today = '2026-10-17';
  const open = '2026-12-01T00:00:00.000Z';
  let seq = 0;
  const newMember = (extra: object = {}) => ({ firstName: `หน้างาน${++seq}`, lastName: 'ทดสอบ', phoneMobile: '0811112222', citizenId: validCitizenId(), birthDate: validBirthDate(), ...extra });
  const admit = (runId: string, body: object) => s('post', `/api/runs/${runId}/walkins`, { operationKey: key(), ...body });
  const attendanceOf = (sessionId: string) => ctx.db.attendance.findMany({ where: { sessionId } });
  beforeAll(async () => {
    ctx = await createTestApp();
    s = staffCaller(ctx, await login(ctx, 'walk-staff@example.test'));
    serviceId = await serviceType(ctx);
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('does not create a walk-in member without an ID number or a stated reason', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 3, sessions: [session(today)] });
    const { citizenId: _unused, ...withoutId } = newMember();
    void _unused;
    const missing = await admit(runId, { currentSessionId: sessionIds[0], sessionIds: [], member: withoutId });
    expect(missing.status).toBe(422);
    expect(missing.body.fields.citizenId).toBeDefined();
    const noBirth = await admit(runId, { currentSessionId: sessionIds[0], sessionIds: [], member: { ...newMember(), birthDate: '' } });
    expect(noBirth.status).toBe(422);
    expect(noBirth.body.fields.birthDate).toBeDefined();
    const waived = await admit(runId, { currentSessionId: sessionIds[0], sessionIds: [], member: { ...withoutId, noCitizenId: true, citizenIdMissingReason: 'ไม่ได้นำบัตรมา' }, closedReason: 'ปิดรับแล้วแต่มาถึงหน้างาน' });
    expect(waived.status).toBe(201);
  });
  it('confirms after registration closed, marks only today as present, and hands over a link QR', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { perSession: true, capacity: 5, requireApproval: true, closes: '2026-10-16T00:00:00.000Z', sessions: [session(today, { capacity: 5 }), session('2026-10-18', { capacity: 5 })] });
    const member = newMember();
    const base = { currentSessionId: sessionIds[0], sessionIds: [sessionIds[1]], member };
    const noReason = await admit(runId, base);
    expect([noReason.status, noReason.body.code]).toEqual([422, 'CLOSED_REASON_REQUIRED']);
    expect(await ctx.db.member.count({ where: { organizationId: ctx.organizationId, firstName: member.firstName } })).toBe(0);
    const done = await admit(runId, { ...base, closedReason: 'มาถึงหน้างานหลังปิดรับ' });
    expect(done.status).toBe(201);
    expect(done.body.created).toBe(true);
    expect(done.body.outcomes.find((o: { sessionId: string }) => o.sessionId === sessionIds[0]).status).toBe('confirmed');
    expect(done.body.outcomes.find((o: { sessionId: string }) => o.sessionId === sessionIds[1]).status).toBe('refused');
    const marks = await attendanceOf(sessionIds[0]!);
    expect(marks.map((m) => [m.memberId, m.status])).toEqual([[done.body.memberId, 'present']]);
    expect(await attendanceOf(sessionIds[1]!)).toEqual([]);
    expect((await ctx.db.member.findUniqueOrThrow({ where: { id: done.body.memberId } })).source).toBe('walkin');
    const reasons = await ctx.db.registrationEvent.findFirstOrThrow({ where: { registrationId: done.body.registrationId, kind: 'walkin' } });
    expect(JSON.stringify(reasons)).not.toContain('มาถึงหน้างาน');
    // The link QR works exactly once for a LINE account.
    expect(done.body.linkUrl).toContain('/member/link?token=');
    const token = new URL(done.body.linkUrl).searchParams.get('token');
    expect((await http(ctx).post('/api/member/link').set(lineHeader('walk-link')).send({ token })).status).toBe(200);
    expect((await http(ctx).get(`/api/member/me/${done.body.memberId}`).set(lineHeader('walk-link'))).status).toBe(200);
    expect((await http(ctx).post('/api/member/link').set(lineHeader('walk-link2')).send({ token })).status).toBe(409);
  });

  it('confirms immediately even when approval is normally required, in whole-run mode', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 5, requireApproval: true, closes: open, sessions: [session(today), session('2026-10-19')] });
    const done = await admit(runId, { currentSessionId: sessionIds[0], sessionIds: [], member: newMember() });
    expect(done.status).toBe(201);
    expect((await ctx.db.registration.findUniqueOrThrow({ where: { id: done.body.registrationId } })).status).toBe('confirmed');
    expect((await attendanceOf(sessionIds[0]!)).length).toBe(1);
    expect((await attendanceOf(sessionIds[1]!)).length).toBe(0);
  });

  it('adds capacity and reserves the walk-in seat atomically, and never overbooks', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 1, closes: open, sessions: [session(today)] });
    const first = await paperMember(ctx, 'เต็มแล้ว');
    await register(s, runId, first.id);
    const attempt = { currentSessionId: sessionIds[0], sessionIds: [], member: newMember() };
    const refused = await admit(runId, attempt);
    expect([refused.status, refused.body.code]).toEqual([409, 'CAPACITY_REQUIRED']);
    expect((await admit(runId, { ...attempt, capacityIncrease: [{ sessionId: null, newCapacity: 1, reason: 'เท่าเดิม' }] })).status).toBe(409);
    expect((await admit(runId, { ...attempt, capacityIncrease: [{ sessionId: null, newCapacity: 2, reason: '' }] })).status).toBe(422);
    expect(await ctx.db.member.count({ where: { organizationId: ctx.organizationId, firstName: attempt.member.firstName } })).toBe(0);
    const done = await admit(runId, { ...attempt, capacityIncrease: [{ sessionId: null, newCapacity: 2, reason: 'ห้องใหญ่พอ' }] });
    expect(done.status).toBe(201);
    const run = await ctx.db.courseRun.findUniqueOrThrow({ where: { id: runId } });
    const held = await ctx.db.registration.count({ where: { runId, status: { in: ['submitted', 'confirmed'] } } });
    expect(run.capacity).toBe(2);
    expect(held).toBeLessThanOrEqual(run.capacity!);
    expect(held).toBe(2);
  });

  it('requires a reason to admit ahead of waiting members, keeps their places, and fills spare seats in order', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 1, closes: open, sessions: [session(today)] });
    const [a, w1, w2] = [await paperMember(ctx, 'ตัวจริง'), await paperMember(ctx, 'รอหนึ่ง'), await paperMember(ctx, 'รอสอง')];
    await register(s, runId, a.id);
    const r1 = await register(s, runId, w1.id);
    const r2 = await register(s, runId, w2.id);
    const body = { currentSessionId: sessionIds[0], sessionIds: [], member: newMember(), capacityIncrease: [{ sessionId: null, newCapacity: 3, reason: 'เพิ่มโต๊ะ' }] };
    const noBypass = await admit(runId, body);
    expect([noBypass.status, noBypass.body.code]).toEqual([422, 'QUEUE_BYPASS_REASON_REQUIRED']);
    expect(await ctx.db.registration.count({ where: { runId } })).toBe(3);
    const done = await admit(runId, { ...body, queueBypassReason: 'ผู้พิการมาถึงก่อนเวลาเรียน' });
    expect(done.status).toBe(201);
    const statuses = async (id: string) => (await ctx.db.registration.findUniqueOrThrow({ where: { id } })).status;
    // Capacity 3: the walk-in took one seat first, the rest of the queue then follows the normal order.
    expect(await statuses(done.body.registrationId)).toBe('confirmed');
    expect(await statuses(r1.body.registrationId)).toBe('confirmed');
    expect(await statuses(r2.body.registrationId)).toBe('waitlisted');
    expect(await ctx.db.registration.count({ where: { runId, status: { in: ['submitted', 'confirmed'] } } })).toBe(3);
  });

  it('blocks walk-ins for own and family records before writing anything', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 5, closes: open, sessions: [session(today)] });
    const own = await joinLine(ctx, 'walk-fam', 'เจ้าหน้าที่', 'หน้างาน', '1981-01-01', serviceId);
    const child = await joinLine(ctx, 'walk-fam', 'ลูก', 'หน้างาน', '2014-01-01', serviceId, { registeringFor: 'another', relationship: 'บุตร' });
    const selfStaff = staffCaller(ctx, await login(ctx, 'walk-self@example.test', 'staff', own));
    for (const id of [own, child]) {
      const response = await selfStaff('post', `/api/runs/${runId}/walkins`, { operationKey: key(), currentSessionId: sessionIds[0], sessionIds: [], memberId: id });
      expect([response.status, response.body.code]).toEqual([403, 'SELF_REVIEW_FORBIDDEN']);
    }
    expect(await ctx.db.registration.count({ where: { runId } })).toBe(0);
    expect(await attendanceOf(sessionIds[0]!)).toEqual([]);
    expect((await admit(runId, { currentSessionId: sessionIds[0], sessionIds: [], memberId: child })).status).toBe(201);
  });

  it('refuses cancelled sessions, cancelled runs and days other than today', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { perSession: true, capacity: 5, closes: open, sessions: [session(today, { capacity: 5 }), session('2026-10-25', { capacity: 5 })] });
    const wrongDay = await admit(runId, { currentSessionId: sessionIds[1], sessionIds: [], member: newMember() });
    expect([wrongDay.status, wrongDay.body.code]).toEqual([422, 'NOT_TODAY']);
    await s('post', `/api/sessions/${sessionIds[0]}/cancel`, { reason: 'ฝนตก' });
    const cancelled = await admit(runId, { currentSessionId: sessionIds[0], sessionIds: [], member: newMember() });
    expect([cancelled.status, cancelled.body.code]).toEqual([409, 'SESSION_CANCELLED']);
    const other = await makeRun(ctx, s, { capacity: 5, closes: open, sessions: [session(today)] });
    await s('post', `/api/runs/${other.runId}/cancel`, { reason: 'งด' });
    expect((await admit(other.runId, { currentSessionId: other.sessionIds[0], sessionIds: [], member: newMember() })).status).toBe(409);
    expect(await ctx.db.member.count({ where: { organizationId: ctx.organizationId, source: 'walkin' } })).toBeGreaterThan(0);
  });

  it('rolls back the new member, seat, attendance and notice if anything fails after intake', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 5, closes: open, sessions: [session(today)] });
    const walkins = ctx.app.get(Walkins);
    const member = newMember({ firstName: 'ล้มกลางทาง' });
    const members = await ctx.db.member.count({ where: { organizationId: ctx.organizationId } });
    const notices = await ctx.db.notification.count({ where: { organizationId: ctx.organizationId } });
    const invites = await ctx.db.signupInvite.count({ where: { organizationId: ctx.organizationId } });
    walkins.failAfterIntake = true;
    try {
      const failed = await admit(runId, { currentSessionId: sessionIds[0], sessionIds: [], member });
      expect(failed.status).toBe(500);
    } finally { walkins.failAfterIntake = false; }
    expect(await ctx.db.member.count({ where: { organizationId: ctx.organizationId } })).toBe(members);
    expect(await ctx.db.member.findFirst({ where: { organizationId: ctx.organizationId, firstName: 'ล้มกลางทาง' } })).toBeNull();
    expect(await ctx.db.registration.count({ where: { runId } })).toBe(0);
    expect(await attendanceOf(sessionIds[0]!)).toEqual([]);
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId } })).toBe(notices);
    expect(await ctx.db.signupInvite.count({ where: { organizationId: ctx.organizationId } })).toBe(invites);
    expect((await admit(runId, { currentSessionId: sessionIds[0], sessionIds: [], member })).status).toBe(201);
  });

  it('handles members who are already booked: confirms a waiting or pending one, only marks a confirmed one', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 1, requireApproval: false, closes: open, sessions: [session(today)] });
    const [confirmed, waiting] = [await paperMember(ctx, 'ยืนยันแล้ว'), await paperMember(ctx, 'รออยู่')];
    const rc = await register(s, runId, confirmed.id);
    const rw = await register(s, runId, waiting.id);
    const marked = await admit(runId, { currentSessionId: sessionIds[0], sessionIds: [], memberId: confirmed.id });
    expect(marked.status).toBe(201);
    expect(marked.body.registrationId).toBe(rc.body.registrationId);
    expect(await ctx.db.registrationSnapshot.count({ where: { registrationId: rc.body.registrationId } })).toBe(1);
    expect((await attendanceOf(sessionIds[0]!)).map((m) => m.memberId)).toEqual([confirmed.id]);
    const full = await admit(runId, { currentSessionId: sessionIds[0], sessionIds: [], memberId: waiting.id });
    expect([full.status, full.body.code]).toEqual([409, 'CAPACITY_REQUIRED']);
    const done = await admit(runId, { currentSessionId: sessionIds[0], sessionIds: [], memberId: waiting.id, capacityIncrease: [{ sessionId: null, newCapacity: 2, reason: 'เพิ่มที่นั่งให้ผู้รอ' }] });
    expect(done.status).toBe(201);
    expect((await ctx.db.registration.findUniqueOrThrow({ where: { id: rw.body.registrationId } })).status).toBe('confirmed');
  });

  it('is idempotent for a repeated operation key', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 5, closes: open, sessions: [session(today)] });
    const op = key();
    const member = newMember({ firstName: 'ส่งซ้ำหน้างาน' });
    const body = { operationKey: op, currentSessionId: sessionIds[0], sessionIds: [], member };
    const [one, two] = [await s('post', `/api/runs/${runId}/walkins`, body), await s('post', `/api/runs/${runId}/walkins`, body)];
    expect([one.status, two.status]).toEqual([201, 201]);
    expect(two.body).toEqual(one.body);
    expect(await ctx.db.member.count({ where: { organizationId: ctx.organizationId, firstName: 'ส่งซ้ำหน้างาน' } })).toBe(1);
  });

  it('still applies the duplicate-person check to walk-in intake', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 5, closes: open, sessions: [session(today)] });
    const existing = await paperMember(ctx, 'ซ้ำหน้างาน', '1995-05-05');
    const dup = await admit(runId, { currentSessionId: sessionIds[0], sessionIds: [], member: { firstName: existing.firstName, lastName: existing.lastName, birthDate: '1995-05-05', citizenId: validCitizenId() } });
    expect([dup.status, dup.body.code]).toEqual([409, 'MEMBER_REVIEW_REQUIRED']);
    expect(await ctx.db.registration.count({ where: { runId } })).toBe(0);
  });
});
