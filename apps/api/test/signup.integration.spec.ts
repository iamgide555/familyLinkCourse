import { validCitizenId } from './helpers.js';
import request from 'supertest';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import { createTestApp, type TestApp } from './test-app.js';
import { hashToken } from '../src/signup/invites.service.js';

describe('member signup and invites', () => {
  let ctx: TestApp;
  let cookie: string[];
  let csrf: string;
  let serviceTypeId: string;
  beforeAll(async () => {
    ctx = await createTestApp();
    serviceTypeId = (await ctx.db.serviceType.create({ data: { organizationId: ctx.organizationId, name: 'Synthetic service' } })).id;
    await ctx.db.user.create({ data: { organizationId: ctx.organizationId, email: 'signup-staff@example.test', name: 'Staff', passwordHash: await hash('Synthetic-password-2026') } });
    const login = await request(ctx.app.getHttpServer()).post('/api/auth/login').send({ email: 'signup-staff@example.test', password: 'Synthetic-password-2026' });
    cookie = ([] as string[]).concat(login.headers['set-cookie']);
    csrf = login.body.csrfToken;
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('issues a one-time signup invite and creates a member only once', async () => {
    const invite = await request(ctx.app.getHttpServer()).post('/api/member/invites').set('Cookie', cookie).set('X-CSRF-Token', csrf).send({ mode: 'signup', prefill: {} });
    expect(invite.status).toBe(201);
    const body = { citizenId: validCitizenId(), inviteToken: invite.body.token, memberType: 'caregiver', firstName: 'ทดสอบ', lastName: 'สมัคร', birthDate: '1990-01-01', phoneMobile: '0812345678', provinceId: 'กระบี่', districtId: 'เกาะลันตา', requestedServiceIds: [serviceTypeId], registeringFor: 'self', privacyConsent: { version: 'v1', consentedBy: 'self', granted: true } };
    const responses = await Promise.all([1, 2].map(() => request(ctx.app.getHttpServer()).post('/api/member/signup').send(body)));
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(responses.find((r) => r.status === 201)?.body.kind).toBe('created');
  });

  it('holds a name and birth-date match without exposing candidates, even when phone differs', async () => {
    const original = await ctx.db.member.create({ data: { organizationId: ctx.organizationId, firstName: 'ศิริ', lastName: 'ทดลอง', normalizedFirstName: 'ศิริ', normalizedLastName: 'ทดลอง', birthDate: '1975-04-05', phoneMobile: '0811111111' } });
    const invite = await request(ctx.app.getHttpServer()).post('/api/member/invites').set('Cookie', cookie).set('X-CSRF-Token', csrf).send({ mode: 'signup' });
    const submission = await request(ctx.app.getHttpServer()).post('/api/member/signup').send({ citizenId: validCitizenId(), inviteToken: invite.body.token, firstName: 'นางศิริ', lastName: 'ทดลอง', birthDate: '1975-04-05', phoneMobile: '0899999999', memberType: 'disabled', provinceId: 'กระบี่', districtId: 'เกาะลันตา', requestedServiceIds: [serviceTypeId], registeringFor: 'self', privacyConsent: { version: 'v1', consentedBy: 'self', granted: true } });
    expect(submission.status).toBe(201);
    expect(submission.body).toEqual({ kind: 'pending', requestId: expect.any(String) });
    expect(JSON.stringify(submission.body)).not.toContain(original.id);
    expect(await ctx.db.member.count({ where: { organizationId: ctx.organizationId, normalizedFirstName: 'ศิริ', normalizedLastName: 'ทดลอง', birthDate: '1975-04-05' } })).toBe(1);
    const stored = await ctx.db.signupRequest.findUniqueOrThrow({ where: { id: submission.body.requestId } });
    expect(JSON.stringify(stored.submittedDataEncrypted)).not.toContain('0899999999');
  });

  it('rejects forged organization and candidate IDs on public signup', async () => {
    const invite = await request(ctx.app.getHttpServer()).post('/api/member/invites').set('Cookie', cookie).set('X-CSRF-Token', csrf).send({ mode: 'signup' });
    const response = await request(ctx.app.getHttpServer()).post('/api/member/signup').send({ inviteToken: invite.body.token, organizationId: randomUUID(), candidateMemberIds: [randomUUID()], firstName: 'อื่น', lastName: 'คน' });
    expect(response.status).toBe(422);
    expect((await ctx.db.signupInvite.findUniqueOrThrow({ where: { tokenHash: hashToken(invite.body.token) } })).usedAt).toBeNull();
  });

  it('asks for an ID number or a reason, and holds a signup whose ID number already belongs to a member', async () => {
    const send = (payload: object) => request(ctx.app.getHttpServer()).post('/api/member/signup').send(payload);
    const invite = async () => (await request(ctx.app.getHttpServer()).post('/api/member/invites').set('Cookie', cookie).set('X-CSRF-Token', csrf).send({ mode: 'signup', prefill: {} })).body.token as string;
    const base = { memberType: 'caregiver', firstName: 'ใหม่', lastName: 'เลขบัตร', birthDate: '1991-07-07', phoneMobile: '0812345670', provinceId: 'กระบี่', districtId: 'เกาะลันตา', requestedServiceIds: [serviceTypeId], registeringFor: 'self', privacyConsent: { version: 'v1', consentedBy: 'self', granted: true } };
    const none = await send({ ...base, inviteToken: await invite() });
    expect(none.status).toBe(422);
    const noReason = await send({ ...base, inviteToken: await invite(), noCitizenId: true });
    expect(noReason.status).toBe(422);
    const waived = await send({ ...base, inviteToken: await invite(), noCitizenId: true, citizenIdMissingReason: 'ยังไม่มีบัตรประชาชน' });
    expect(waived.status).toBe(201);
    expect(waived.body.kind).toBe('created');
    // Same ID number, different name and birth date: never create a second person with it; staff decide.
    const shared = validCitizenId();
    const first = await send({ ...base, firstName: 'คนแรก', lastName: 'เลขซ้ำ', birthDate: '1985-01-01', inviteToken: await invite(), citizenId: shared });
    expect(first.body.kind).toBe('created');
    const second = await send({ ...base, firstName: 'คนที่สอง', lastName: 'ชื่ออื่น', birthDate: '1999-09-09', inviteToken: await invite(), citizenId: shared });
    expect(second.status).toBe(201);
    expect(second.body.kind).toBe('pending');
  });
});
