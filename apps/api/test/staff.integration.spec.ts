import request from 'supertest';
import { hash } from 'argon2';
import { createTestApp, type TestApp } from './test-app.js';
import { Audit } from '../src/audit/audit.service.js';
import { Authorization } from '../src/authorization/authorization.service.js';
import type { StaffActor } from '../../../packages/contracts/src/core.js';

// Catches missing account provisioning, unsafe account projections, audit omission and self-review.
describe('staff administration and approval boundaries', () => {
  let ctx: TestApp;
  let adminId: string;
  const password = 'Synthetic-password-2026';
  beforeAll(async () => {
    ctx = await createTestApp();
    const user = await ctx.db.user.create({
      data: {
        organizationId: ctx.organizationId,
        email: 'admin@example.test',
        name: 'ผู้ดูแลระบบ',
        passwordHash: await hash(password),
        role: 'admin',
      },
    });
    adminId = user.id;
  });
  afterAll(async () => {
    if (ctx) await ctx.close();
  });
  const login = () =>
    request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:4200')
      .send({ email: 'admin@example.test', password });
  const actor = (): StaffActor => ({
    kind: 'staff',
    organizationId: ctx.organizationId,
    userId: adminId,
    role: 'admin',
    memberId: null,
  });
  it('admin creates an account without returning its password hash', async () => {
    const session = await login();
    const result = await request(ctx.app.getHttpServer())
      .post('/api/staff')
      .set('Cookie', session.headers['set-cookie'])
      .set('X-CSRF-Token', session.body.csrfToken)
      .send({ email: 'new@example.test', name: 'เจ้าหน้าที่ใหม่', role: 'staff', password });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ email: 'new@example.test', role: 'staff' });
    expect(result.body).not.toHaveProperty('passwordHash');
    expect(
      (
        await request(ctx.app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: 'new@example.test', password })
      ).status,
    ).toBe(200);
  });
  it('admin can read safe staff account list', async () => {
    const session = await login();
    const result = await request(ctx.app.getHttpServer())
      .get('/api/staff')
      .set('Cookie', session.headers['set-cookie']);
    expect(result.status).toBe(200);
    expect(result.body.some((u: { id: string }) => u.id === adminId)).toBe(true);
    expect(JSON.stringify(result.body)).not.toContain('passwordHash');
  });
  it('writes only field names into audit metadata', async () => {
    const audit = ctx.app.get(Audit);
    await ctx.db.$transaction((tx) =>
      audit.record(tx, actor(), {
        action: 'staff.update',
        entity: 'user',
        entityId: adminId,
        fields: ['name'],
      }),
    );
    const logs = await ctx.db.auditLog.findMany({
      where: { organizationId: ctx.organizationId, action: 'staff.update' },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].fields).toEqual(['name']);
    expect(JSON.stringify(logs)).not.toContain('ผู้ดูแลระบบ');
    await expect(
      ctx.db.$transaction((tx) =>
        audit.record(tx, actor(), {
          action: 'staff.update',
          entity: 'user',
          entityId: adminId,
          fields: ['secret note text'],
        }),
      ),
    ).rejects.toThrow();
  });
  it('member actors cannot pass staff role authorization', () => {
    expect(() =>
      ctx.app
        .get(Authorization)
        .requireRole(
          { kind: 'member', organizationId: ctx.organizationId, lineAccountId: 'line-synthetic' },
          ['admin'],
        ),
    ).toThrow();
  });
  it('staff and admins cannot approve their own or same-LINE family record', async () => {
    const own = await ctx.db.member.create({
      data: {
        organizationId: ctx.organizationId,
        firstName: 'ผู้ดูแล',
        lastName: 'ตัวอย่าง',
        lineAccountId: 'same-line',
      },
    });
    const family = await ctx.db.member.create({
      data: {
        organizationId: ctx.organizationId,
        firstName: 'สมาชิก',
        lastName: 'ตัวอย่าง',
        lineAccountId: 'same-line',
      },
    });
    const reviewer = { ...actor(), memberId: own.id };
    await expect(
      ctx.db.$transaction((tx) => ctx.app.get(Authorization).assertCanReview(tx, reviewer, own.id)),
    ).rejects.toThrow();
    await expect(
      ctx.db.$transaction((tx) =>
        ctx.app.get(Authorization).assertCanReview(tx, reviewer, family.id),
      ),
    ).rejects.toThrow();
  });
  it('does not allow removal of the last active admin', async () => {
    const session = await login();
    try {
      const result = await request(ctx.app.getHttpServer())
        .patch(`/api/staff/${adminId}`)
        .set('Cookie', session.headers['set-cookie'])
        .set('X-CSRF-Token', session.body.csrfToken)
        .send({ active: false });
      expect(result.status).toBe(409);
      expect((await ctx.db.user.findUniqueOrThrow({ where: { id: adminId } })).active).toBe(true);
    } finally {
      await ctx.db.user.update({ where: { id: adminId }, data: { active: true } });
    }
  });
  it('audit metadata lists only submitted update fields', async () => {
    const session = await login();
    const result = await request(ctx.app.getHttpServer())
      .patch(`/api/staff/${adminId}`)
      .set('Cookie', session.headers['set-cookie'])
      .set('X-CSRF-Token', session.body.csrfToken)
      .send({ name: 'ชื่อใหม่สำหรับทดสอบ' });
    expect(result.status).toBe(200);
    const last = await ctx.db.auditLog.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, entityId: adminId, action: 'staff.update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(last.fields).toEqual(['name']);
  });
});
