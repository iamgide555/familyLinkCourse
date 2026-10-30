import { randomUUID } from 'node:crypto';
import { createTestApp, type TestApp } from './test-app.js';
import { NotificationWorker } from '../src/notifications/notification-worker.js';
import { SimulatedTransport } from '../src/notifications/simulated.transport.js';
import { login, makeRun, paperMember, register, staffCaller } from './helpers.js';

describe('staff-only mode never pretends to deliver', () => {
  let ctx: TestApp;
  let worker: NotificationWorker;
  let s: ReturnType<typeof staffCaller>;
  beforeAll(async () => {
    ctx = await createTestApp({ staffOnly: true, devIdentityEnabled: false });
    worker = ctx.app.get(NotificationWorker);
    s = staffCaller(ctx, await login(ctx, 'staffonly@example.test'));
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('leaves a notice for a member with an email as a staff follow-up instead of a simulated send', async () => {
    const m = await paperMember(ctx, 'มีอีเมล', '1962-05-05', 'has-mail@example.test');
    await ctx.db.member.update({ where: { id: m.id }, data: { phoneMobile: '0812223344' } });
    const n = await ctx.db.notification.create({ data: { organizationId: ctx.organizationId, eventId: randomUUID(), kind: 'signup.created', recipientKind: 'member', recipientId: m.id, entityRefs: {}, dedupeKey: `${randomUUID()}:pending` } });
    while (await worker.tick()) { /* drain */ }
    const after = await ctx.db.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.status).toBe('staff_followup');
    expect(ctx.app.get(SimulatedTransport).captured()).toHaveLength(0);
  });

  it('shows promotions for such members on the call list and reports delivery as staff-only', async () => {
    const a = await paperMember(ctx, 'ก', '1963-01-01', 'a-mail@example.test');
    const b = await paperMember(ctx, 'ข', '1963-01-02');
    const { runId } = await makeRun(ctx, s, { capacity: 1 });
    const ra = await register(s, runId, a.id);
    await register(s, runId, b.id);
    await s('post', `/api/registrations/${ra.body.registrationId}/cancel`, { reason: 'ทดสอบ', operationKey: randomUUID() });
    while (await worker.tick()) { /* drain */ }
    const groups = (await s('get', '/api/notifications/call-list')).body.groups as Array<{ runId: string; items: Array<{ memberId: string; kind: string }> }>;
    expect(groups.find((g) => g.runId === runId)!.items.map((i) => [i.memberId, i.kind])).toEqual([[b.id, 'waitlist.promoted']]);
    expect((await s('get', '/api/notifications/summary')).body.delivery).toBe('staff_only');
    expect(ctx.app.get(SimulatedTransport).captured()).toHaveLength(0);
  });
});
