import request from 'supertest';
import { hash } from 'argon2';
import { createTestApp, type TestApp } from './test-app.js';

type Session = { cookie: string[]; csrf: string };
const consent = { version: 'v1', consentedBy: 'self', granted: true };

describe('profile correction requests', () => {
  let ctx: TestApp;
  let staff: Session;
  let serviceTypeId: string;
  let otherServiceId: string;
  const http = () => request(ctx.app.getHttpServer());
  const line = (id: string) => ({ 'x-dev-line-user-id': `synthetic-${id}` });
  const login = async (email: string, memberId?: string): Promise<Session> => {
    await ctx.db.user.create({ data: { organizationId: ctx.organizationId, email, name: email, memberId: memberId ?? null, passwordHash: await hash('Synthetic-password-2026') } });
    const response = await http().post('/api/auth/login').send({ email, password: 'Synthetic-password-2026' });
    return { cookie: ([] as string[]).concat(response.headers['set-cookie']), csrf: response.body.csrfToken };
  };
  const staffReq = (session: Session, method: 'get' | 'post' | 'patch', path: string) => {
    const r = http()[method](path).set('Cookie', session.cookie);
    return method === 'get' ? r : r.set('X-CSRF-Token', session.csrf);
  };
  const join = async (lineId: string, first: string, last: string, birthDate: string) => {
    const response = await http().post('/api/member/signup').set(line(lineId)).send({
      firstName: first, lastName: last, birthDate, phoneMobile: '0812345678', memberType: 'caregiver', provinceId: 'กระบี่',
      districtId: 'เกาะลันตา', requestedServiceIds: [serviceTypeId], registeringFor: 'self', privacyConsent: consent,
    });
    expect(response.body.kind).toBe('created');
    return response.body.memberId as string;
  };
  const submit = (lineId: string, memberId: string, patch: object) => http().post(`/api/member/me/${memberId}/profile-changes`).set(line(lineId)).send(patch);
  const decide = (session: Session, id: string, approve: boolean) => staffReq(session, 'post', `/api/member/profile-changes/${id}/decision`).send({ approve });

  beforeAll(async () => {
    ctx = await createTestApp();
    serviceTypeId = (await ctx.db.serviceType.create({ data: { organizationId: ctx.organizationId, name: 'บริการหนึ่ง' } })).id;
    otherServiceId = (await ctx.db.serviceType.create({ data: { organizationId: ctx.organizationId, name: 'บริการสอง' } })).id;
    staff = await login('profile-staff@example.test');
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('rejects patches that touch hidden or staff-managed fields', async () => {
    const id = await join('hidden1', 'ซ่อน', 'ฟิลด์', '1980-01-01');
    for (const patch of [{ citizenId: '1101700230705' }, { householdIncome: '100000' }, { signedFormAt: '2026-01-01T00:00:00.000Z' }, { phoneMobile: '0899999999', disabilityType: 'x' }, {}]) {
      const response = await submit('hidden1', id, patch);
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('FIELD_NOT_EDITABLE');
    }
    expect(await ctx.db.profileChangeRequest.count({ where: { organizationId: ctx.organizationId, memberId: id } })).toBe(0);
  });

  it('applies an approved correction to the current profile and notifies the member', async () => {
    const id = await join('edit1', 'แก้ไข', 'ข้อมูล', '1975-05-05');
    const created = await submit('edit1', id, { phoneMobile: '0899990000', email: 'new@example.test', requestedServiceIds: [serviceTypeId, otherServiceId] });
    expect(created.status).toBe(201);
    expect(created.body.fields.sort()).toEqual(['email', 'phoneMobile', 'requestedServiceIds']);
    const before = await http().get(`/api/member/me/${id}`).set(line('edit1'));
    expect(before.body.phoneMobile).toBe('0812345678');
    const stored = await ctx.db.profileChangeRequest.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(JSON.stringify(stored.changesEncrypted)).not.toContain('0899990000');
    const queue = await staffReq(staff, 'get', '/api/member/profile-changes');
    expect(queue.body.items.find((x: { id: string }) => x.id === created.body.id)).toEqual(expect.objectContaining({ memberName: 'แก้ไข ข้อมูล', newValues: expect.objectContaining({ phoneMobile: '0899990000' }), oldValues: expect.objectContaining({ phoneMobile: '0812345678' }) }));
    expect((await staffReq(staff, 'get', '/api/reviews/summary')).body.profileChanges).toBeGreaterThanOrEqual(1);
    const approved = await decide(staff, created.body.id, true);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');
    const after = await http().get(`/api/member/me/${id}`).set(line('edit1'));
    expect(after.body).toEqual(expect.objectContaining({ phoneMobile: '0899990000', email: 'new@example.test', requestedServiceIds: expect.arrayContaining([serviceTypeId, otherServiceId]) }));
    const note = await ctx.db.notification.findFirstOrThrow({ where: { organizationId: ctx.organizationId, kind: 'profile.approved', recipientId: id } });
    expect(JSON.stringify(note)).not.toContain('0899990000');
    const logs = await ctx.db.auditLog.findMany({ where: { organizationId: ctx.organizationId, entityId: created.body.id } });
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['profile_change.submit', 'profile_change.approve']));
    expect(JSON.stringify(logs)).not.toContain('0899990000');
    expect((await decide(staff, created.body.id, true)).status).toBe(409);
  });

  it('detects an intervening staff correction instead of overwriting it', async () => {
    const id = await join('stale1', 'ทันสมัย', 'ล้าสมัย', '1982-02-02');
    const created = await submit('stale1', id, { phoneMobile: '0877777777' });
    const current = await staffReq(staff, 'get', `/api/members/${id}`);
    const fix = await staffReq(staff, 'patch', `/api/members/${id}`).send({ firstName: current.body.firstName, lastName: current.body.lastName, phoneMobile: '0866666666', expectedVersion: current.body.version, birthDate: current.body.birthDate });
    expect(fix.status).toBe(200);
    const approval = await decide(staff, created.body.id, true);
    expect(approval.status).toBe(409);
    expect(approval.body.code).toBe('PROFILE_CHANGED');
    expect((await http().get(`/api/member/me/${id}`).set(line('stale1'))).body.phoneMobile).toBe('0866666666');
    const rejection = await decide(staff, created.body.id, false);
    expect(rejection.body.status).toBe('rejected');
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, kind: 'profile.rejected', recipientId: id } })).toBe(1);
  });

  it('allows one pending request at a time and only for the owning LINE account', async () => {
    const id = await join('owner2', 'เจ้าของ', 'เดียว', '1990-09-09');
    expect((await submit('owner2', id, { phoneMobile: '0811110000' })).status).toBe(201);
    expect((await submit('owner2', id, { phoneMobile: '0811110001' })).status).toBe(409);
    expect((await submit('intruder', id, { phoneMobile: '0811110002' })).status).toBe(404);
    expect((await submit('owner2', id, { phoneMobile: '0812345678' })).status).toBe(422);
    expect((await http().get(`/api/member/me/${id}/profile-changes`).set(line('intruder'))).status).toBe(404);
    const mine = await http().get(`/api/member/me/${id}/profile-changes`).set(line('owner2'));
    expect(mine.body.items).toHaveLength(1);
  });

  it('validates corrected values and refuses duplicates of another member', async () => {
    const id = await join('valid1', 'ตรวจสอบ', 'ค่า', '1991-01-01');
    await join('valid2', 'ชื่อซ้ำ', 'ปลายทาง', '1992-02-02');
    for (const patch of [{ phoneMobile: '12345' }, { birthDate: '2999-01-01' }, { email: 'not-mail' }, { provinceId: 'ไม่มีจริง' }, { requestedServiceIds: [] }, { memberType: 'hacker' }]) {
      expect((await submit('valid1', id, patch)).status).toBe(422);
    }
    const created = await submit('valid1', id, { firstName: 'ชื่อซ้ำ', lastName: 'ปลายทาง', birthDate: '1992-02-02' });
    expect(created.status).toBe(201);
    const approval = await decide(staff, created.body.id, true);
    expect(approval.status).toBe(409);
    expect(approval.body.code).toBe('MEMBER_REVIEW_REQUIRED');
  });

  it('blocks staff from reviewing their own or their family’s profile requests', async () => {
    const own = await join('stafffam', 'สตาฟ', 'สมาชิก', '1986-06-06');
    const self = await login('profile-self@example.test', own);
    const created = await submit('stafffam', own, { phoneMobile: '0822220000' });
    const denied = await decide(self, created.body.id, true);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('SELF_REVIEW_FORBIDDEN');
    expect((await decide(staff, created.body.id, true)).status).toBe(200);
  });

  it('cancels pending requests when the member is unlinked', async () => {
    const id = await join('gone1', 'ถูกถอน', 'สิทธิ์', '1987-07-07');
    const created = await submit('gone1', id, { phoneMobile: '0833330000' });
    await staffReq(staff, 'post', `/api/members/${id}/unlink`).send({ reason: 'เปลี่ยนผู้ดูแล' });
    expect((await ctx.db.profileChangeRequest.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe('rejected');
  });
});

describe('participant membership view', () => {
  let ctx: TestApp;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { if (ctx) await ctx.close(); });
  it('shows tier and expiry read-only, and nothing else from the staff-managed record', async () => {
    const service = (await ctx.db.serviceType.create({ data: { organizationId: ctx.organizationId, name: 'บริการสมาชิกภาพ' } })).id;
    const response = await request(ctx.app.getHttpServer()).post('/api/member/signup').set('x-dev-line-user-id', 'synthetic-tier-view').send({ firstName: 'ดูสมาชิกภาพ', lastName: 'ทดสอบ', birthDate: '1980-01-01', phoneMobile: '0812345678', memberType: 'caregiver', provinceId: 'กระบี่', districtId: 'เกาะลันตา', requestedServiceIds: [service], registeringFor: 'self', privacyConsent: consent });
    const before = await request(ctx.app.getHttpServer()).get(`/api/member/me/${response.body.memberId}`).set('x-dev-line-user-id', 'synthetic-tier-view');
    expect(before.body.membership).toEqual({ status: 'general', tierName: 'สมาชิกทั่วไป', expiresAt: null });
    const tier = await ctx.db.membershipTier.create({ data: { organizationId: ctx.organizationId, name: 'สมาชิกสามัญ', fee: '500', durationMonths: 12 } });
    await ctx.db.member.update({ where: { id: response.body.memberId }, data: { currentTierId: tier.id, membershipExpiresAt: new Date('2027-01-31') } });
    const after = await request(ctx.app.getHttpServer()).get(`/api/member/me/${response.body.memberId}`).set('x-dev-line-user-id', 'synthetic-tier-view');
    expect(after.body.membership).toEqual({ status: 'active', tierName: 'สมาชิกสามัญ', expiresAt: '2027-01-31' });
    expect(Object.keys(after.body).sort()).toEqual(['birthDate', 'completeness', 'districtId', 'email', 'firstName', 'id', 'lastName', 'memberType', 'membership', 'phoneMobile', 'provinceId', 'requestedServiceIds', 'signedFormAt']);
  });
});
