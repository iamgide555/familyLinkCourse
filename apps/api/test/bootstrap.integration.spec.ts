import { createTestApp, type TestApp } from './test-app.js';
import { bootstrapAdmin } from '../src/auth/bootstrap-admin.js';
import { verify } from 'argon2';

describe('first admin bootstrap', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    if (ctx) await ctx.close();
  });
  it('requires an explicit strong password instead of a default', async () => {
    await expect(
      bootstrapAdmin(ctx.db, ctx.organizationId, {
        email: 'first@example.test',
        name: 'Admin',
        password: '',
      }),
    ).rejects.toThrow();
    expect(await ctx.db.user.count({ where: { organizationId: ctx.organizationId } })).toBe(0);
  });
  it('creates one admin with an Argon2 hash and refuses to overwrite it', async () => {
    const input = {
      email: 'first@example.test',
      name: 'ผู้ดูแลระบบ',
      password: 'Explicit-password-2026',
    };
    await bootstrapAdmin(ctx.db, ctx.organizationId, input);
    const user = await ctx.db.user.findUnique({
      where: { organizationId_email: { organizationId: ctx.organizationId, email: input.email } },
    });
    expect(user?.role).toBe('admin');
    expect(await verify(user!.passwordHash, input.password)).toBe(true);
    await expect(
      bootstrapAdmin(ctx.db, ctx.organizationId, {
        ...input,
        password: 'Overwritten-password-2026',
      }),
    ).rejects.toThrow();
    expect((await ctx.db.user.findUniqueOrThrow({ where: { id: user!.id } })).passwordHash).toBe(
      user!.passwordHash,
    );
  });
});
