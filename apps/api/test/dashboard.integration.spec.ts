import { createTestApp, type TestApp } from './test-app.js';
import { joinLine, login, makeRun, paperMember, register, serviceType, session, staffCaller } from './helpers.js';

describe('staff dashboard', () => {
  let ctx: TestApp;
  let s: ReturnType<typeof staffCaller>;
  beforeAll(async () => { ctx = await createTestApp(); s = staffCaller(ctx, await login(ctx, 'dash-staff@example.test')); });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('counts reservations separately from attendance, per mode and per session', async () => {
    const whole = await makeRun(ctx, s, { capacity: 3, requireApproval: true, closes: '2026-12-01T00:00:00.000Z', sessions: [session('2026-10-17'), session('2026-10-18')] });
    const per = await makeRun(ctx, s, { perSession: true, capacity: 1, closes: '2026-12-01T00:00:00.000Z', sessions: [session('2026-10-17', { capacity: 1 }), session('2026-10-19', { capacity: 1 })] });
    const people = await Promise.all(['ก', 'ข', 'ค', 'ง'].map((n) => paperMember(ctx, `แดช${n}`)));
    const [a, b, c, d] = people as [typeof people[0], typeof people[0], typeof people[0], typeof people[0]];
    const ra = await register(s, whole.runId, a.id);
    await s('post', `/api/registrations/${ra.body.registrationId}/review`, { approve: true });
    await register(s, whole.runId, b.id);
    await register(s, per.runId, c.id, { sessionIds: [per.sessionIds[0]!] });
    await register(s, per.runId, d.id, { sessionIds: [per.sessionIds[0]!, per.sessionIds[1]!] });
    await s('post', `/api/sessions/${whole.sessionIds[0]}/attendance`, { memberId: a.id, status: 'present' });
    const out = (await s('get', '/api/dashboard?from=2026-10-17&to=2026-10-19')).body;
    const sessionOf = (id: string) => out.sessions.find((x: { sessionId: string }) => x.sessionId === id);
    expect(sessionOf(whole.sessionIds[0]!)).toMatchObject({ registered: 1, present: 1, absent: 0, unmarked: 0 });
    expect(sessionOf(whole.sessionIds[1]!)).toMatchObject({ registered: 1, present: 0, unmarked: 1 });
    expect(sessionOf(per.sessionIds[0]!)).toMatchObject({ registered: 1, present: 0, unmarked: 1 });
    expect(sessionOf(per.sessionIds[1]!)).toMatchObject({ registered: 1 });
    expect(out.totals.attendedForRange).toBe(1);
    expect(out.totals.registeredForRange).toBe(4);
    const wholeRun = out.runs.find((r: { runId: string }) => r.runId === whole.runId);
    expect(wholeRun).toMatchObject({ confirmed: 1, submitted: 1, waitlisted: 0, capacity: 3 });
    const perRun = out.runs.find((r: { runId: string }) => r.runId === per.runId);
    expect(perRun).toMatchObject({ confirmed: 2, submitted: 0, waitlisted: 1, perSession: true, capacity: null });
    expect(out.unsignedForms).toBeGreaterThanOrEqual(4);
  });

  it('shows pending reviews and failed-message slots, and omits cancelled sessions from registered counts', async () => {
    const svc = await serviceType(ctx);
    const original = await joinLine(ctx, 'dash-orig', 'ซ้ำแดช', 'ทดสอบ', '1977-07-07', svc);
    await joinLine(ctx, 'dash-dup', 'ซ้ำแดช', 'ทดสอบ', '1977-07-07', svc).catch(() => undefined);
    const dup = await ctx.db.signupRequest.count({ where: { organizationId: ctx.organizationId, status: 'pending' } });
    const run = await makeRun(ctx, s, { capacity: 5, closes: '2026-12-01T00:00:00.000Z', sessions: [session('2026-10-20'), session('2026-10-21')] });
    await register(s, run.runId, original);
    await s('post', `/api/sessions/${run.sessionIds[0]}/cancel`, { reason: 'ฝน' });
    const out = (await s('get', '/api/dashboard?from=2026-10-20&to=2026-10-21')).body;
    expect(out.reviews.signupRequests).toBe(dup);
    expect(out.sessions.find((x: { sessionId: string }) => x.sessionId === run.sessionIds[0])).toMatchObject({ status: 'cancelled', registered: 0 });
    expect(out.sessions.find((x: { sessionId: string }) => x.sessionId === run.sessionIds[1])).toMatchObject({ registered: 1 });
    await ctx.db.notification.create({ data: { organizationId: ctx.organizationId, eventId: crypto.randomUUID(), kind: 'registration.confirmed', recipientKind: 'member', recipientId: original, entityRefs: {}, status: 'staff_followup', dedupeKey: crypto.randomUUID() } });
    expect((await s('get', '/api/dashboard')).body.followUp.failedNotices).toBe(1);
  });

  it('validates the date range', async () => {
    expect((await s('get', '/api/dashboard?from=2026-10-20&to=2026-10-10')).status).toBe(422);
    expect((await s('get', '/api/dashboard?from=2026-01-01&to=2027-01-01')).status).toBe(422);
    expect((await s('get', '/api/dashboard?from=nope')).status).toBe(422);
    expect((await s('get', '/api/dashboard')).body.today).toBe('2026-10-17');
  });
});
