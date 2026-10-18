import { createTestApp, type TestApp } from './test-app.js';
import { key, login, makeRun, paperMember, register, signin, staffCaller } from './helpers.js';

describe('offline paid membership records', () => {
  let ctx: TestApp;
  let admin: ReturnType<typeof staffCaller>;
  let staff: ReturnType<typeof staffCaller>;
  let annual: string;
  let lifetime: string;
  const pay = (caller: typeof admin, memberId: string, extra: object = {}) => caller('post', `/api/members/${memberId}/memberships`, { tierId: annual, startsAt: '2026-01-01', expiresAt: '2026-12-31', amountPaid: '500', paidAt: '2026-01-02', paymentMethod: 'cash', ...extra });
  const summary = async (memberId: string) => (await staff('get', `/api/members/${memberId}`)).body;
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = staffCaller(ctx, await login(ctx, 'mem-admin@example.test', 'admin'));
    staff = staffCaller(ctx, await login(ctx, 'mem-staff@example.test', 'staff'));
    annual = (await admin('post', '/api/membership-tiers', { name: 'สมาชิกสามัญ', fee: '500', durationMonths: 12 })).body.id;
    lifetime = (await admin('post', '/api/membership-tiers', { name: 'สมาชิกตลอดชีพ', fee: '5000', durationMonths: null })).body.id;
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('lets staff read tiers but only admins manage tiers and fees', async () => {
    expect((await staff('get', '/api/membership-tiers')).body.items.map((t: { name: string }) => t.name)).toEqual(['สมาชิกสามัญ', 'สมาชิกตลอดชีพ']);
    expect((await staff('post', '/api/membership-tiers', { name: 'ใหม่', fee: '1', durationMonths: 1 })).status).toBe(403);
    expect((await staff('patch', `/api/membership-tiers/${annual}`, { fee: '1' })).status).toBe(403);
    expect((await admin('post', '/api/membership-tiers', { name: 'สมาชิกสามัญ', fee: '1', durationMonths: 1 })).status).toBe(409);
    expect((await admin('post', '/api/membership-tiers', { name: 'ค่าไม่ถูก', fee: '12.345', durationMonths: 1 })).status).toBe(422);
    const changed = await admin('patch', `/api/membership-tiers/${annual}`, { fee: '600.50' });
    expect(changed.body.fee).toBe('600.50');
    await admin('patch', `/api/membership-tiers/${annual}`, { fee: '500' });
  });

  it('keeps the paid tier and shows expired once the expiry date passes', async () => {
    const m = await paperMember(ctx, 'หมดอายุ');
    expect((await summary(m.id)).membershipStatus).toBe('general');
    expect((await pay(staff, m.id, { expiresAt: '2026-10-17' })).status).toBe(201);
    let now = await summary(m.id);
    expect([now.membershipStatus, now.tierName, now.membershipExpiresAt]).toEqual(['active', 'สมาชิกสามัญ', '2026-10-17']);
    // Bangkok midnight is 17:00Z: the expiry day itself is still valid until then.
    ctx.clock.set('2026-10-17T16:59:59.000Z');
    const before = staffCaller(ctx, await signin(ctx, 'mem-staff@example.test'));
    expect((await before('get', `/api/members/${m.id}`)).body.membershipStatus).toBe('active');
    ctx.clock.set('2026-10-17T17:00:00.000Z');
    const staffLater = staffCaller(ctx, await signin(ctx, 'mem-staff@example.test'));
    now = (await staffLater('get', `/api/members/${m.id}`)).body;
    expect([now.membershipStatus, now.tierName]).toEqual(['expired', 'สมาชิกสามัญ']);
    expect((await ctx.db.member.findUniqueOrThrow({ where: { id: m.id } })).currentTierId).toBe(annual);
    ctx.clock.set('2026-10-17T03:00:00.000Z');
    staff = staffCaller(ctx, await signin(ctx, 'mem-staff@example.test'));
  });

  it('has no expiry for lifetime tiers, and requires an explicit expiry for the others', async () => {
    const m = await paperMember(ctx, 'ตลอดชีพ');
    expect((await pay(staff, m.id, { tierId: lifetime, expiresAt: '2030-01-01', amountPaid: '5000' })).status).toBe(422);
    const ok = await pay(staff, m.id, { tierId: lifetime, expiresAt: null, amountPaid: '5000' });
    expect(ok.body.expiresAt).toBeNull();
    const now = await summary(m.id);
    expect([now.membershipStatus, now.membershipExpiresAt]).toEqual(['lifetime', null]);
    const other = await paperMember(ctx, 'ไม่มีวันหมดอายุ');
    expect((await pay(staff, other.id, { expiresAt: null })).status).toBe(422);
    expect((await pay(staff, other.id, { expiresAt: '2025-12-31' })).status).toBe(422);
  });

  it('validates money, dates, method and tier', async () => {
    const m = await paperMember(ctx, 'ตรวจเงิน');
    for (const [label, body] of [['letters', { amountPaid: 'abc' }], ['three decimals', { amountPaid: '1.234' }], ['negative', { amountPaid: '-5' }], ['future payment', { paidAt: '2026-10-18' }], ['bad method', { paymentMethod: 'bitcoin' }], ['unknown tier', { tierId: '00000000-0000-4000-8000-000000000000' }], ['bad date', { startsAt: '2026-02-30' }]] as const)
      expect([label, (await pay(staff, m.id, body)).status]).toEqual([label, 422]);
    await admin('patch', `/api/membership-tiers/${annual}`, { active: false });
    expect((await pay(staff, m.id)).status).toBe(422);
    await admin('patch', `/api/membership-tiers/${annual}`, { active: true });
    expect((await pay(staff, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('keeps every payment, lets only admins correct or void, and recomputes the current tier', async () => {
    const m = await paperMember(ctx, 'หลายครั้ง');
    const first = await pay(staff, m.id, { startsAt: '2025-01-01', expiresAt: '2025-12-31', paidAt: '2025-01-02' });
    const second = await pay(staff, m.id, { tierId: lifetime, expiresAt: null, startsAt: '2026-02-01', amountPaid: '5000', paidAt: '2026-02-02' });
    expect((await summary(m.id)).tierName).toBe('สมาชิกตลอดชีพ');
    expect((await staff('patch', `/api/memberships/${first.body.id}`, { note: 'x' })).status).toBe(403);
    const denied = await staff('post', `/api/memberships/${second.body.id}/void`, { reason: 'บันทึกผิด' });
    expect(denied.status).toBe(403);
    expect((await admin('post', `/api/memberships/${second.body.id}/void`, { reason: '' })).status).toBe(422);
    const voided = await admin('post', `/api/memberships/${second.body.id}/void`, { reason: 'บันทึกผิดคน' });
    expect(voided.body.voided).toBe(true);
    const now = await summary(m.id);
    expect([now.tierName, now.membershipStatus, now.membershipExpiresAt]).toEqual(['สมาชิกสามัญ', 'expired', '2025-12-31']);
    const history = (await staff('get', `/api/members/${m.id}/memberships`)).body;
    expect(history.items).toHaveLength(2);
    expect(history.items.map((x: { voided: boolean }) => x.voided).sort()).toEqual([false, true]);
    expect((await admin('post', `/api/memberships/${second.body.id}/void`, { reason: 'อีกครั้ง' })).status).toBe(409);
    expect((await admin('patch', `/api/memberships/${second.body.id}`, { note: 'ไม่ได้' })).status).toBe(409);
    const fixed = await admin('patch', `/api/memberships/${first.body.id}`, { expiresAt: '2027-12-31', amountPaid: '600.00' });
    expect(fixed.body.expiresAt).toBe('2027-12-31');
    expect((await summary(m.id)).membershipStatus).toBe('active');
    const logs = await ctx.db.auditLog.findMany({ where: { organizationId: ctx.organizationId, entity: 'membership' } });
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['membership.record', 'membership.void', 'membership.correct']));
    expect(JSON.stringify(logs)).not.toContain('บันทึกผิดคน');
  });

  it('records a renewal without removing the earlier payment', async () => {
    const m = await paperMember(ctx, 'ต่ออายุ');
    await pay(staff, m.id, { startsAt: '2025-01-01', expiresAt: '2025-12-31', paidAt: '2025-01-05' });
    expect((await summary(m.id)).membershipStatus).toBe('expired');
    await pay(staff, m.id, { startsAt: '2026-01-01', expiresAt: '2026-12-31', paidAt: '2026-01-10' });
    const now = await summary(m.id);
    expect([now.membershipStatus, now.membershipExpiresAt]).toEqual(['active', '2026-12-31']);
    expect((await staff('get', `/api/members/${m.id}/memberships`)).body.items).toHaveLength(2);
  });

  it('does not stop an expired member from registering for a course', async () => {
    const m = await paperMember(ctx, 'หมดอายุแต่ลงทะเบียน');
    await pay(staff, m.id, { startsAt: '2025-01-01', expiresAt: '2025-12-31', paidAt: '2025-01-05' });
    expect((await summary(m.id)).membershipStatus).toBe('expired');
    const { runId } = await makeRun(ctx, staff, { capacity: 3 });
    const response = await register(staff, runId, m.id);
    expect(response.status).toBe(201);
    expect(response.body.outcomes[0].status).toBe('confirmed');
    void key;
  });

  it('filters members by tier and status, and sums fees exactly per month without voided payments', async () => {
    const [a, b, c] = [await paperMember(ctx, 'กรองหนึ่ง'), await paperMember(ctx, 'กรองสอง'), await paperMember(ctx, 'กรองสาม')];
    await pay(staff, a.id, { expiresAt: '2026-12-31', amountPaid: '0.10', paidAt: '2026-05-01' });
    await pay(staff, b.id, { expiresAt: '2026-10-30', amountPaid: '0.20', paidAt: '2026-05-15' });
    await pay(staff, c.id, { startsAt: '2025-01-01', expiresAt: '2025-06-30', amountPaid: '1000', paidAt: '2026-06-02' });
    const wrong = await pay(staff, a.id, { startsAt: '2026-03-01', expiresAt: '2026-12-31', amountPaid: '9999', paidAt: '2026-05-20' });
    await admin('post', `/api/memberships/${wrong.body.id}/void`, { reason: 'บันทึกผิด' });
    const ids = async (query: string) => ((await staff('get', `/api/members?q=กรอง&${query}`)).body.items as Array<{ id: string }>).map((x) => x.id).sort();
    expect(await ids('membership=expired')).toEqual([c.id]);
    expect(await ids('membership=expiring30')).toEqual([b.id]);
    expect(await ids('membership=active')).toEqual([a.id, b.id].sort());
    expect(await ids(`tier=${annual}`)).toEqual([a.id, b.id, c.id].sort());
    expect(await ids('tier=general')).toEqual([]);
    expect((await staff('get', '/api/members?membership=nonsense')).status).toBe(422);
    const fees = (await staff('get', '/api/reports/membership-fees?from=2026-05-01&to=2026-06-30')).body.items;
    expect(fees).toEqual([{ month: '2026-06', total: '1000.00', count: 1 }, { month: '2026-05', total: '0.30', count: 2 }]);
    expect((await staff('get', '/api/reports/membership-fees?from=junk')).status).toBe(422);
  });
});
