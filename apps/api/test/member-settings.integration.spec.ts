import { withIdentity } from './helpers.js';
import request from 'supertest';
import { hash } from 'argon2';
import { createTestApp, type TestApp } from './test-app.js';

describe('member settings and PDPA administration', () => {
  let ctx: TestApp;
  let adminCookie: string[];
  let adminCsrf: string;
  let staffCookie: string[];
  let staffCsrf: string;
  const login = async (email: string) => {
    const result = await request(ctx.app.getHttpServer()).post('/api/auth/login').send({ email, password: 'Synthetic-password-2026' });
    return { cookie: ([] as string[]).concat(result.headers['set-cookie']), csrf: result.body.csrfToken as string };
  };
  const api = (role: 'admin' | 'staff', method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: object) =>
    request(ctx.app.getHttpServer())[method](path)
      .set('Cookie', role === 'admin' ? adminCookie : staffCookie)
      .set('X-CSRF-Token', role === 'admin' ? adminCsrf : staffCsrf)
      .send(path === '/api/members' && method === 'post' && body ? withIdentity(body) : body);
  beforeAll(async () => {
    ctx = await createTestApp();
    for (const role of ['admin', 'staff'] as const) await ctx.db.user.create({ data: {
      organizationId: ctx.organizationId, email: `${role}@settings.test`, name: role,
      role, passwordHash: await hash('Synthetic-password-2026'),
    } });
    ({ cookie: adminCookie, csrf: adminCsrf } = await login('admin@settings.test'));
    ({ cookie: staffCookie, csrf: staffCsrf } = await login('staff@settings.test'));
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('allows only admins to configure service and document types, and preserves seeded document labels', async () => {
    const documents = await api('admin', 'get', '/api/settings/document-types');
    expect(documents.status).toBe(200);
    expect(documents.body.items.map((x: {name: string}) => x.name)).toContain('บัตรคนพิการ');
    expect((await api('staff', 'post', '/api/settings/service-types', { name: 'บริการทดสอบ' })).status).toBe(403);
    const added = await api('admin', 'post', '/api/settings/service-types', { name: 'บริการทดสอบ' });
    expect(added.status).toBe(201);
    expect((await api('staff', 'get', '/api/settings/service-types')).body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: added.body.id, name: 'บริการทดสอบ' })]),
    );
  });
  it('persists requested service choices only from configured active types', async () => {
    const type = await api('admin', 'post', '/api/settings/service-types', { name: 'ตัวเลือกสมมติ' });
    const saved = await api('staff', 'post', '/api/members', { firstName: 'บริการ', lastName: 'ทดสอบ', requestedServiceIds: [type.body.id] });
    expect(saved.status).toBe(201);
    expect(saved.body.requestedServiceIds).toEqual([type.body.id]);
    const bad = await api('staff', 'post', '/api/members', { firstName: 'บริการผิด', lastName: 'ทดสอบ', requestedServiceIds: ['not-found'] });
    expect(bad.status).toBe(422);
  });
  it('retains an inactive historical service during unrelated member edits', async () => {
    const type = await api('admin', 'post', '/api/settings/service-types', { name: 'บริการเก่า' });
    const member = await api('staff', 'post', '/api/members', { firstName: 'บริการเก่า', lastName: 'ทดสอบ', requestedServiceIds: [type.body.id] });
    expect(member.status).toBe(201);
    expect((await api('admin', 'patch', `/api/settings/service-types/${type.body.id}`, { active: false })).status).toBe(200);
    const edit = await api('staff', 'patch', `/api/members/${member.body.id}`, {
      firstName: 'บริการเก่า', lastName: 'ทดสอบ', email: 'keep@example.test',
      requestedServiceIds: [type.body.id], expectedVersion: member.body.version,
    });
    expect(edit.status).toBe(200);
    expect(edit.body.requestedServiceIds).toEqual([type.body.id]);
  });
  it('logs admin PDPA access and deletion requests without exposing member data to staff', async () => {
    const member = await api('staff', 'post', '/api/members', { firstName: 'สิทธิข้อมูล', lastName: 'ทดสอบ' });
    const denied = await api('staff', 'post', `/api/members/${member.body.id}/pdpa-requests`, { kind: 'access', reason: 'เจ้าของข้อมูลขอ' });
    expect(denied.status).toBe(403);
    const opened = await api('admin', 'post', `/api/members/${member.body.id}/pdpa-requests`, { kind: 'access', reason: 'เจ้าของข้อมูลขอ' });
    expect(opened.status).toBe(201);
    expect(opened.body.status).toBe('open');
    const completed = await api('admin', 'patch', `/api/members/${member.body.id}/pdpa-requests/${opened.body.id}`, { status: 'completed', note: 'ส่งสำเนาตามขั้นตอน' });
    expect(completed.status).toBe(200);
    const logs = await ctx.db.auditLog.findMany({ where: { organizationId: ctx.organizationId, entityId: member.body.id } });
    expect(logs.map((x) => x.action)).toEqual(expect.arrayContaining(['member.pdpa_request_open', 'member.pdpa_request_complete']));
    expect(JSON.stringify(logs)).not.toContain('เจ้าของข้อมูลขอ');
  });
  it('completing a deletion request soft deletes the member in the same operation', async () => {
    const member = await api('staff', 'post', '/api/members', { firstName: 'คำขอลบ', lastName: 'ทดสอบ' });
    const opened = await api('admin', 'post', `/api/members/${member.body.id}/pdpa-requests`, { kind: 'deletion', reason: 'เจ้าของข้อมูลขอลบ' });
    expect(opened.status).toBe(201);
    const completed = await api('admin', 'patch', `/api/members/${member.body.id}/pdpa-requests/${opened.body.id}`, { status: 'completed', note: 'ดำเนินการตามคำขอ' });
    expect(completed.status).toBe(200);
    expect((await api('staff', 'get', `/api/members/${member.body.id}`)).status).toBe(404);
    expect((await ctx.db.member.findUnique({ where: { id: member.body.id } }))?.deletedAt).toBeTruthy();
  });
  it('soft deletes only for admins and removes the member from active search and profile', async () => {
    const member = await api('staff', 'post', '/api/members', { firstName: 'ลบซ่อน', lastName: 'ทดสอบ' });
    expect((await api('staff', 'delete', `/api/members/${member.body.id}`, { reason: 'duplicate' })).status).toBe(403);
    expect((await api('admin', 'delete', `/api/members/${member.body.id}`, { reason: 'duplicate' })).status).toBe(200);
    expect((await api('staff', 'get', `/api/members/${member.body.id}`)).status).toBe(404);
    expect((await api('staff', 'get', '/api/members?q=ลบซ่อน')).body.items).toHaveLength(0);
    expect((await ctx.db.member.findFirst({ where: { id: member.body.id } }))?.deletedAt).toBeTruthy();
    const deletion = await ctx.db.pdpaRequest.findFirst({ where: { organizationId: ctx.organizationId, memberId: member.body.id, kind: 'manual_delete' } });
    expect(deletion).toBeTruthy();
    expect(JSON.stringify(deletion)).not.toContain('duplicate');
  });
});
