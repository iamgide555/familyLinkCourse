import request from 'supertest';
import { createTestApp, type TestApp } from './test-app.js';

describe('participant identity boundary', () => {
  let ctx: TestApp;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { if (ctx) await ctx.close(); });
  it('requires verified member identity for profile access, including browser invite context', async () => {
    expect((await request(ctx.app.getHttpServer()).get('/api/member/me')).status).toBe(401);
    expect((await request(ctx.app.getHttpServer()).get('/api/member/me').set('X-Dev-Line-User-Id', 'forged')).status).toBe(401);
  });
  it('rejects development identity in production even if the header and flag are supplied', async () => {
    const original = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const result = await request(ctx.app.getHttpServer()).get('/api/member/me').set('X-Dev-Line-User-Id', 'synthetic-test-owner');
      expect(result.status).toBe(401);
    } finally { process.env['NODE_ENV'] = original; }
  });
  it('isolates selected members by verified account, not by requested member ID', async () => {
    const first = await request(ctx.app.getHttpServer()).get('/api/member/me').set('X-Dev-Line-User-Id', 'synthetic-first-owner');
    const second = await request(ctx.app.getHttpServer()).get('/api/member/me').set('X-Dev-Line-User-Id', 'synthetic-second-owner');
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const account = await ctx.db.lineAccount.findFirstOrThrow({ where: { organizationId: ctx.organizationId, lineUserId: 'synthetic-first-owner' } });
    const member = await ctx.db.member.create({ data: { organizationId: ctx.organizationId, lineAccountId: account.id, firstName: 'เจ้าของ', lastName: 'คนแรก' } });
    expect((await request(ctx.app.getHttpServer()).get(`/api/member/me/${member.id}`).set('X-Dev-Line-User-Id', 'synthetic-second-owner')).status).toBe(404);
    const own = await request(ctx.app.getHttpServer()).get(`/api/member/me/${member.id}`).set('X-Dev-Line-User-Id', 'synthetic-first-owner');
    expect(own.status).toBe(200);
    expect(own.body).not.toHaveProperty('citizenId');
    expect(own.body).not.toHaveProperty('intakeEncrypted');
  });
});
