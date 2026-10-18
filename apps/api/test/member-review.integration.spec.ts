import request from 'supertest';
import { hash } from 'argon2';
import { createTestApp, type TestApp } from './test-app.js';

type Session = { cookie: string[]; csrf: string };
const consent = { version: 'v1', consentedBy: 'self', granted: true };

describe('signup review, LINE links and caregiver access', () => {
  let ctx: TestApp;
  let staff: Session;
  let serviceTypeId: string;
  const http = () => request(ctx.app.getHttpServer());
  const line = (id: string) => ({ 'x-dev-line-user-id': `synthetic-${id}` });
  const login = async (email: string, memberId?: string): Promise<Session> => {
    await ctx.db.user.create({ data: { organizationId: ctx.organizationId, email, name: email, memberId: memberId ?? null, passwordHash: await hash('Synthetic-password-2026') } });
    const response = await http().post('/api/auth/login').send({ email, password: 'Synthetic-password-2026' });
    return { cookie: ([] as string[]).concat(response.headers['set-cookie']), csrf: response.body.csrfToken };
  };
  const staffReq = (session: Session, method: 'get' | 'post', path: string) => {
    const r = http()[method](path).set('Cookie', session.cookie);
    return method === 'get' ? r : r.set('X-CSRF-Token', session.csrf);
  };
  const body = (first: string, last: string, birthDate: string, extra: object = {}) => ({
    firstName: first, lastName: last, birthDate, phoneMobile: '0812345678', memberType: 'caregiver',
    provinceId: 'กระบี่', districtId: 'เกาะลันตา', requestedServiceIds: [serviceTypeId], registeringFor: 'self', privacyConsent: consent, ...extra,
  });
  const signup = (lineId: string, payload: object) => http().post('/api/member/signup').set(line(lineId)).send(payload);
  const pending = async () => (await staffReq(staff, 'get', '/api/member/reviews')).body as Array<{ id: string; candidates: Array<{ id: string; linked: boolean }>; submitted: { firstName: string } }>;

  beforeAll(async () => {
    ctx = await createTestApp();
    serviceTypeId = (await ctx.db.serviceType.create({ data: { organizationId: ctx.organizationId, name: 'Synthetic service' } })).id;
    staff = await login('review-staff@example.test');
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('shows staff the candidates and lets only the applicant see a waiting state', async () => {
    const original = await signup('orig1', body('ต้นฉบับ', 'หนึ่ง', '1980-01-01'));
    expect(original.body.kind).toBe('created');
    const second = await signup('new1', body('นางต้นฉบับ', 'หนึ่ง', '1980-01-01', { phoneMobile: '0899999999' }));
    expect(second.body).toEqual({ kind: 'pending', requestId: expect.any(String) });
    const me = await http().get('/api/member/me').set(line('new1'));
    expect(me.body.members).toEqual([]);
    expect(me.body.pending).toHaveLength(1);
    expect(JSON.stringify(me.body)).not.toContain(original.body.memberId);
    const queue = (await pending()).find((r) => r.id === second.body.requestId)!;
    expect(queue.candidates).toEqual([expect.objectContaining({ id: original.body.memberId, linked: true })]);
    expect((await http().get(`/api/member/me/${original.body.memberId}`).set(line('new1'))).status).toBe(404);
  });

  it('refuses to link a candidate that already belongs to another LINE account', async () => {
    const queue = (await pending()).find((r) => r.submitted.firstName === 'นางต้นฉบับ')!;
    const decision = await staffReq(staff, 'post', `/api/member/reviews/${queue.id}/decision`).send({ decision: 'link_existing', memberId: queue.candidates[0]!.id });
    expect(decision.status).toBe(409);
    expect(decision.body.code).toBe('LINK_EXISTS');
  });

  it('keeps an existing family member usable while a sibling signup is pending', async () => {
    const a = await signup('family1', body('พี่', 'ครอบครัว', '1970-02-02'));
    expect(a.body.kind).toBe('created');
    const duplicate = await signup('family1', body('พี่', 'ครอบครัว', '1970-02-02', { registeringFor: 'another', relationship: 'พี่น้อง' }));
    expect(duplicate.body.kind).toBe('pending');
    const me = await http().get('/api/member/me').set(line('family1'));
    expect(me.body.members.map((m: { id: string }) => m.id)).toEqual([a.body.memberId]);
    expect(me.body.pending).toHaveLength(1);
    expect((await http().get(`/api/member/me/${a.body.memberId}`).set(line('family1'))).status).toBe(200);
  });

  it('moves access to a new caregiver only after unlink and staff-approved review', async () => {
    const member = await signup('old1', body('ย้าย', 'ผู้ดูแล', '1985-05-05'));
    const id = member.body.memberId as string;
    expect((await http().get(`/api/member/me/${id}`).set(line('old1'))).status).toBe(200);
    expect((await staffReq(staff, 'post', `/api/members/${id}/unlink`).send({})).status).toBe(422);
    const unlinked = await staffReq(staff, 'post', `/api/members/${id}/unlink`).send({ reason: 'ผู้ดูแลเปลี่ยนคน' });
    expect(unlinked.status).toBe(200);
    expect((await http().get(`/api/member/me/${id}`).set(line('old1'))).status).toBe(404);
    const oldAccount = await ctx.db.lineAccount.findFirstOrThrow({ where: { organizationId: ctx.organizationId, lineUserId: 'synthetic-old1' } });
    expect(oldAccount.richMenuState).toBe('guest');
    const applicant = await signup('new2', body('นายย้าย', 'ผู้ดูแล', '1985-05-05'));
    expect(applicant.body.kind).toBe('pending');
    expect((await http().get(`/api/member/me/${id}`).set(line('new2'))).status).toBe(404);
    const queued = (await pending()).find((r) => r.id === applicant.body.requestId)!;
    const done = await staffReq(staff, 'post', `/api/member/reviews/${queued.id}/decision`).send({ decision: 'link_existing', memberId: id });
    expect(done.body).toEqual({ status: 'linked', memberId: id });
    expect((await http().get(`/api/member/me/${id}`).set(line('new2'))).status).toBe(200);
    expect((await http().get(`/api/member/me/${id}`).set(line('old1'))).status).toBe(404);
    const newAccount = await ctx.db.lineAccount.findFirstOrThrow({ where: { organizationId: ctx.organizationId, lineUserId: 'synthetic-new2' } });
    expect(newAccount.richMenuState).toBe('member');
    const events = await ctx.db.linkEvent.findMany({ where: { organizationId: ctx.organizationId, memberId: id } });
    expect(events.map((e) => e.kind)).toContain('unlink');
    expect(JSON.stringify(events)).not.toContain('ผู้ดูแลเปลี่ยนคน');
  });

  it('link QR links one account exactly once, even under competition', async () => {
    const member = await ctx.db.member.create({ data: { organizationId: ctx.organizationId, firstName: 'คิวอาร์', lastName: 'เดินเข้า', normalizedFirstName: 'คิวอาร์', normalizedLastName: 'เดินเข้า', birthDate: '1999-09-09', source: 'paper' } });
    const issued = await staffReq(staff, 'post', '/api/member/invites').send({ mode: 'link', memberId: member.id });
    expect(issued.status).toBe(201);
    expect(issued.body.url).toContain('/member/link?token=');
    const results = await Promise.all(['qr-first', 'qr-second'].map((id) => http().post('/api/member/link').set(line(id)).send({ token: issued.body.token })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const linked = await ctx.db.member.findUniqueOrThrow({ where: { id: member.id } });
    const winner = await ctx.db.lineAccount.findUniqueOrThrow({ where: { id: linked.lineAccountId! } });
    expect(['synthetic-qr-first', 'synthetic-qr-second']).toContain(winner.lineUserId);
    const again = await http().post('/api/member/link').set(line('qr-third')).send({ token: issued.body.token });
    expect(again.status).toBe(409);
    expect((await http().post('/api/member/link').send({ token: 'x' })).status).toBe(401);
  });

  it('link QR never replaces an existing link and expires after seven days', async () => {
    const owned = await signup('owner1', body('มีเจ้าของ', 'แล้ว', '1992-02-02'));
    const issued = await staffReq(staff, 'post', '/api/member/invites').send({ mode: 'link', memberId: owned.body.memberId });
    const blocked = await http().post('/api/member/link').set(line('thief')).send({ token: issued.body.token });
    expect(blocked.status).toBe(409);
    expect((await http().get(`/api/member/me/${owned.body.memberId}`).set(line('owner1'))).status).toBe(200);
    const free = await ctx.db.member.create({ data: { organizationId: ctx.organizationId, firstName: 'หมดอายุ', lastName: 'แล้ว', normalizedFirstName: 'หมดอายุ', normalizedLastName: 'แล้ว', birthDate: '1990-01-01' } });
    const stale = await staffReq(staff, 'post', '/api/member/invites').send({ mode: 'link', memberId: free.id });
    ctx.clock.advance(7 * 24 * 60 * 60 * 1000);
    expect((await http().post('/api/member/link').set(line('late')).send({ token: stale.body.token })).status).toBe(409);
    ctx.clock.set('2026-10-17T03:00:00.000Z');
  });

  it('blocks review of own and same-LINE family records', async () => {
    const own = await signup('staffline', body('เจ้าหน้าที่', 'สมาชิก', '1988-08-08'));
    const sibling = await signup('staffline', body('น้อง', 'ของเจ้าหน้าที่', '2010-10-10', { registeringFor: 'another', relationship: 'บุตร' }));
    const self = await login('self-staff@example.test', own.body.memberId);
    const pendingReq = await signup('other-applicant', body('น้อง', 'ของเจ้าหน้าที่', '2010-10-10'));
    expect(pendingReq.body.kind).toBe('pending');
    const queued = (await pending()).find((r) => r.id === pendingReq.body.requestId)!;
    for (const id of [own.body.memberId, sibling.body.memberId]) {
      const denied = await staffReq(self, 'post', `/api/members/${id}/unlink`).send({ reason: 'ทดสอบ' });
      expect(denied.status).toBe(403);
    }
    const reviewDenied = await staffReq(self, 'post', `/api/member/reviews/${queued.id}/decision`).send({ decision: 'reject', reason: 'ทดสอบ' });
    expect(reviewDenied.status).toBe(403);
    expect(reviewDenied.body.code).toBe('SELF_REVIEW_FORBIDDEN');
    const allowed = await staffReq(staff, 'post', `/api/member/reviews/${queued.id}/decision`).send({ decision: 'reject', reason: 'ไม่ใช่คนเดียวกัน' });
    expect(allowed.status).toBe(201);
  });

  it('a LINE owner can remove a member from their own switcher without affecting others', async () => {
    const a = await signup('switch1', body('สลับ', 'หนึ่ง', '1960-01-01'));
    const b = await signup('switch1', body('สลับ', 'สอง', '1961-01-01', { registeringFor: 'another', relationship: 'คู่สมรส' }));
    expect((await http().post(`/api/member/me/${a.body.memberId}/remove`).set(line('other1'))).status).toBe(404);
    expect((await http().post(`/api/member/me/${a.body.memberId}/remove`).set(line('switch1'))).status).toBe(200);
    expect((await http().get(`/api/member/me/${a.body.memberId}`).set(line('switch1'))).status).toBe(404);
    expect((await http().get(`/api/member/me/${b.body.memberId}`).set(line('switch1'))).status).toBe(200);
    const account = await ctx.db.lineAccount.findFirstOrThrow({ where: { organizationId: ctx.organizationId, lineUserId: 'synthetic-switch1' } });
    expect(account.richMenuState).toBe('member');
    const record = await ctx.db.member.findUniqueOrThrow({ where: { id: a.body.memberId } });
    expect(record.lineAccountId).toBeNull();
    expect(record.deletedAt).toBeNull();
  });

  it('create-new and reject decisions notify the applicant without matched-record details', async () => {
    const existing = await signup('exist9', body('คนเดิม', 'เก้า', '1999-12-12'));
    const dup = await signup('dup9', body('คนเดิม', 'เก้า', '1999-12-12'));
    const queued = (await pending()).find((r) => r.id === dup.body.requestId)!;
    const created = await staffReq(staff, 'post', `/api/member/reviews/${queued.id}/decision`).send({ decision: 'create_new', reason: 'คนละคน ชื่อซ้ำกัน' });
    expect(created.body.status).toBe('created_new');
    expect(created.body.memberId).not.toBe(existing.body.memberId);
    const note = await ctx.db.notification.findFirstOrThrow({ where: { organizationId: ctx.organizationId, recipientId: dup.body.requestId } });
    expect(note.kind).toBe('signup.created');
    expect(JSON.stringify(note.entityRefs)).not.toContain(existing.body.memberId);
    expect((await http().get(`/api/member/me/${created.body.memberId}`).set(line('dup9'))).status).toBe(200);
  });
});
