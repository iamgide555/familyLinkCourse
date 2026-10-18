import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createTestApp, type TestApp } from './test-app.js';
import { startStub, type Stub } from './stubs.js';
import { consent, validCitizenId } from './helpers.js';

describe('real LINE identity verification', () => {
  let ctx: TestApp;
  let line: Stub;
  let serviceTypeId: string;
  const now = () => Math.floor(ctx.clock.now().getTime() / 1000);
  const claims = (over: object = {}) => ({ iss: 'https://access.line.me', sub: 'Uverified0001', aud: 'login-channel', exp: now() + 3600, name: 'ผู้ใช้จริง', ...over });
  const verifyHits = () => line.requests.filter((r) => r.url === '/oauth2/v2.1/verify');
  const http = () => request(ctx.app.getHttpServer());
  const body = (extra: object = {}) => ({ citizenId: validCitizenId(), firstName: 'ยืนยันตัวตน', lastName: 'ไลน์', birthDate: '1980-06-06', phoneMobile: '0812345678', memberType: 'caregiver', provinceId: 'กระบี่', districtId: 'เกาะลันตา', requestedServiceIds: [serviceTypeId], registeringFor: 'self', privacyConsent: consent, ...extra });
  beforeAll(async () => {
    line = await startStub((req) => {
      const token = new URLSearchParams(req.body).get('id_token') ?? '';
      const table: Record<string, object | null> = { good: claims(), expired: claims({ exp: now() - 10 }), 'wrong-aud': claims({ aud: 'someone-else' }), 'wrong-iss': claims({ iss: 'https://evil.example' }), other: claims({ sub: 'Uverified0002' }), 'no-sub': claims({ sub: '' }) };
      const hit = table[token];
      return hit ? { status: 200, body: hit } : { status: 400, body: { error: 'invalid_request' } };
    });
    ctx = await createTestApp({ devIdentityEnabled: false, line: { channelAccessToken: 't', channelSecret: 's', loginChannelId: 'login-channel', liffId: 'liff-1', apiBase: line.url, richMenuMemberId: 'menu', monthlyQuota: null } });
    serviceTypeId = (await ctx.db.serviceType.create({ data: { organizationId: ctx.organizationId, name: 'บริการยืนยัน' } })).id;
  });
  afterAll(async () => { await line.close(); if (ctx) await ctx.close(); });

  it('ignores a forged LINE user id, from the development header or from the browser', async () => {
    expect((await http().get('/api/member/me').set('x-dev-line-user-id', 'synthetic-forged-1')).status).toBe(401);
    expect((await http().post('/api/member/signup').set('x-dev-line-user-id', 'synthetic-forged-1').send(body())).status).toBe(401);
    const real = await http().get('/api/member/me').set('x-dev-line-user-id', 'synthetic-forged-1').set('Authorization', 'Bearer good');
    expect(real.status).toBe(200);
    expect(await ctx.db.lineAccount.count({ where: { organizationId: ctx.organizationId, lineUserId: 'synthetic-forged-1' } })).toBe(0);
    expect(await ctx.db.lineAccount.count({ where: { organizationId: ctx.organizationId, lineUserId: 'Uverified0001' } })).toBe(1);
  });

  it('rejects expired, wrong-audience, wrong-issuer and unknown tokens without creating anything', async () => {
    const before = await ctx.db.lineAccount.count({ where: { organizationId: ctx.organizationId } });
    for (const token of ['expired', 'wrong-aud', 'wrong-iss', 'no-sub', 'garbage', '']) {
      const r = await http().get('/api/member/me').set('Authorization', `Bearer ${token}`);
      expect([token, r.status]).toEqual([token, token ? 401 : 401]);
    }
    expect(await ctx.db.lineAccount.count({ where: { organizationId: ctx.organizationId } })).toBe(before);
  });

  it('verifies the token on the server, binds the trusted subject, and caches briefly', async () => {
    const hitsBefore = verifyHits().length;
    const created = await http().post('/api/member/signup').set('Authorization', 'Bearer other').send(body({ firstName: 'คนที่สอง' }));
    expect(created.status).toBe(201);
    expect(created.body.kind).toBe('created');
    const member = await ctx.db.member.findUniqueOrThrow({ where: { id: created.body.memberId } });
    const account = await ctx.db.lineAccount.findUniqueOrThrow({ where: { id: member.lineAccountId! } });
    expect(account.lineUserId).toBe('Uverified0002');
    expect(account.displayName).toBe('ผู้ใช้จริง');
    const me = await http().get('/api/member/me').set('Authorization', 'Bearer other');
    expect(me.body.members.map((m: { id: string }) => m.id)).toEqual([created.body.memberId]);
    expect(verifyHits().length - hitsBefore).toBe(1);
    const sent = verifyHits().at(-1)!;
    expect(new URLSearchParams(sent.body).get('client_id')).toBe('login-channel');
    // The other account cannot read this member.
    expect((await http().get(`/api/member/me/${created.body.memberId}`).set('Authorization', 'Bearer good')).status).toBe(404);
  });

  it('keeps browser invites working for sign-up only, with no profile or course access', async () => {
    const browserToken = randomUUID();
    await ctx.db.signupInvite.create({ data: { organizationId: ctx.organizationId, tokenHash: (await import('../src/signup/invites.service.js')).hashToken(browserToken), mode: 'signup', createdById: 'x', prefillEncrypted: ctx.app.get((await import('../src/crypto/field-crypto.js')).FieldCrypto).encrypt('{}') as never, expiresAt: new Date(ctx.clock.now().getTime() + 86400000) } });
    const created = await http().post('/api/member/signup').send(body({ inviteToken: browserToken, firstName: 'ผ่านเบราว์เซอร์' }));
    expect(created.status).toBe(201);
    expect((await http().get('/api/member/me')).status).toBe(401);
    expect((await http().get('/api/member/courses')).status).toBe(401);
    expect((await http().get('/api/member/config')).body).toEqual({ liffId: 'liff-1', devIdentity: false });
  });
});
