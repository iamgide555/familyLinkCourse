import request from 'supertest';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import { jest } from '@jest/globals';
import { createTestApp, type TestApp } from './test-app.js';

// Catches lost session revocation, missing authorization, CSRF and tenant checks.
describe('staff authentication against PostgreSQL', () => {
  let ctx: TestApp;
  let adminId: string;
  let staffId: string;
  const password = 'Synthetic-password-2026';
  const origin = 'http://localhost:4200';
  const login = (email = 'admin@example.test', value = password) =>
    request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email, password: value });

  beforeAll(async () => {
    ctx = await createTestApp();
    const passwordHash = await hash(password);
    const admin = await ctx.db.user.create({
      data: {
        organizationId: ctx.organizationId,
        email: 'admin@example.test',
        name: 'ผู้ดูแลระบบ',
        passwordHash,
        role: 'admin',
      },
    });
    const staff = await ctx.db.user.create({
      data: {
        organizationId: ctx.organizationId,
        email: 'staff@example.test',
        name: 'เจ้าหน้าที่ทดสอบ',
        passwordHash,
        role: 'staff',
      },
    });
    adminId = admin.id;
    staffId = staff.id;
  });
  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  it('accepts correct credentials and exposes safe staff identity', async () => {
    const result = await login();
    expect(result.status).toBe(200);
    expect(result.body.user).toMatchObject({ id: adminId, name: 'ผู้ดูแลระบบ', role: 'admin' });
    expect(result.body.user).not.toHaveProperty('passwordHash');
    expect(result.body.csrfToken).toEqual(expect.any(String));
    const cookie = result.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const session = await request(ctx.app.getHttpServer())
      .get('/api/auth/session')
      .set('Cookie', cookie);
    expect(session.status).toBe(200);
    expect(session.body.user.id).toBe(adminId);
  });

  it('does not authenticate a wrong password or an unknown user', async () => {
    const wrong = await login('admin@example.test', 'wrong-password');
    const unknown = await login('unknown@example.test', password);
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.code).toBe(unknown.body.code);
  });

  it('rejects staff access without a staff session', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/api/staff');
    expect(response.status).toBe(401);
  });

  it('prevents ordinary staff from managing staff accounts', async () => {
    const result = await login('staff@example.test');
    const response = await request(ctx.app.getHttpServer())
      .get('/api/staff')
      .set('Cookie', result.headers['set-cookie']);
    expect(response.status).toBe(403);
  });

  it('rejects a mutating staff request without its CSRF token', async () => {
    const result = await login();
    const response = await request(ctx.app.getHttpServer())
      .patch(`/api/staff/${staffId}`)
      .set('Origin', origin)
      .set('Cookie', result.headers['set-cookie'])
      .send({ active: false });
    expect(response.status).toBe(403);
    expect((await ctx.db.user.findUniqueOrThrow({ where: { id: staffId } })).active).toBe(true);
  });

  it('disabled user cannot reuse a previously issued session', async () => {
    const staff = await login('staff@example.test');
    const admin = await login();
    const change = await request(ctx.app.getHttpServer())
      .patch(`/api/staff/${staffId}`)
      .set('Origin', origin)
      .set('Cookie', admin.headers['set-cookie'])
      .set('X-CSRF-Token', admin.body.csrfToken)
      .send({ active: false });
    expect(change.status).toBe(200);
    const result = await request(ctx.app.getHttpServer())
      .get('/api/auth/session')
      .set('Cookie', staff.headers['set-cookie']);
    expect(result.status).toBe(401);
    expect((await login('staff@example.test')).status).toBe(401);
  });

  it('expires a staff session at thirty minutes of inactivity', async () => {
    const result = await login();
    ctx.clock.advance(30 * 60 * 1000);
    const response = await request(ctx.app.getHttpServer())
      .get('/api/auth/session')
      .set('Cookie', result.headers['set-cookie']);
    expect(response.status).toBe(401);
  });

  it('logout revokes the session even when the old cookie is reused', async () => {
    const result = await login();
    const logout = await request(ctx.app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', origin)
      .set('Cookie', result.headers['set-cookie'])
      .set('X-CSRF-Token', result.body.csrfToken)
      .send();
    expect(logout.status).toBe(200);
    expect(
      (
        await request(ctx.app.getHttpServer())
          .get('/api/auth/session')
          .set('Cookie', result.headers['set-cookie'])
      ).status,
    ).toBe(401);
  });

  it('rejects a forged organization and prevents cross-organization account changes', async () => {
    const otherId = randomUUID();
    await ctx.db.organization.create({ data: { id: otherId, name: 'Other synthetic org' } });
    try {
      const other = await ctx.db.user.create({
        data: {
          organizationId: otherId,
          email: 'outside@example.test',
          name: 'Other',
          passwordHash: await hash(password),
          role: 'staff',
        },
      });
      const admin = await login();
      const result = await request(ctx.app.getHttpServer())
        .patch(`/api/staff/${other.id}`)
        .set('Origin', origin)
        .set('Cookie', admin.headers['set-cookie'])
        .set('X-CSRF-Token', admin.body.csrfToken)
        .send({ active: false, organizationId: otherId });
      expect([404, 422]).toContain(result.status);
      expect((await ctx.db.user.findUniqueOrThrow({ where: { id: other.id } })).active).toBe(true);
      await expect(
        ctx.db.session.create({
          data: {
            organizationId: ctx.organizationId,
            userId: other.id,
            tokenHash: randomUUID(),
            expiresAt: new Date(Date.now() + 60000),
          },
        }),
      ).rejects.toThrow();
    } finally {
      await ctx.db.organization.delete({ where: { id: otherId } });
    }
  });

  it('throttles repeated failed logins', async () => {
    for (let i = 0; i < 5; i++) await login('ratelimit@example.test', 'wrong-password');
    expect((await login('ratelimit@example.test', 'wrong-password')).status).toBe(429);
  });
  it('limits concurrent login guesses instead of allowing every request past the counter', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => login('concurrent@example.test', 'wrong-password')),
    );
    expect(responses.filter((response) => response.status === 401)).toHaveLength(5);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(5);
  });
  it('password reset prevents an in-flight login from minting a session with the retired password', async () => {
    const email = 'reset-race@example.test';
    const user = await ctx.db.user.create({
      data: {
        organizationId: ctx.organizationId,
        email,
        name: 'Synthetic race',
        role: 'staff',
        passwordHash: await hash(password),
      },
    });
    const admin = await login();
    let release!: () => void;
    let read!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const didRead = new Promise<void>((resolve) => {
      read = resolve;
    });
    const original = ctx.db.user.findUnique.bind(ctx.db.user);
    const lookup: {
      findUnique(
        args: Parameters<typeof original>[0],
      ): Promise<Awaited<ReturnType<typeof original>>>;
    } = ctx.db.user;
    // Delay delivery of a real DB read; reset remains real HTTP + PostgreSQL.
    const barrier = jest.spyOn(lookup, 'findUnique').mockImplementation(async (args) => {
      const row = await original(args);
      if (args.where.organizationId_email?.email === email) {
        read();
        await gate;
      }
      return row;
    });
    const pending = login(email).then((response) => response);
    try {
      await didRead;
      const reset = await request(ctx.app.getHttpServer())
        .patch(`/api/staff/${user.id}`)
        .set('Cookie', admin.headers['set-cookie'])
        .set('X-CSRF-Token', admin.body.csrfToken)
        .send({ password: 'Replacement-password-2026' });
      expect(reset.status).toBe(200);
      release();
      const result = await pending;
      expect(result.status).toBe(401);
      expect(
        await ctx.db.session.count({
          where: { organizationId: ctx.organizationId, userId: user.id },
        }),
      ).toBe(0);
    } finally {
      release();
      await pending;
      barrier.mockRestore();
    }
  });
});
