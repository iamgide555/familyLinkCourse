import request from 'supertest';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import type { StaffActor } from '../../../packages/contracts/src/core.js';
import { CaseNotes } from '../src/case-notes/case-notes.service.js';
import { createTestApp, type TestApp } from './test-app.js';

type Login = { cookie: string[]; csrf: string; userId: string };

describe('encrypted staff case-note history', () => {
  let ctx: TestApp;
  let memberId: string;
  let author: Login;
  let colleague: Login;
  let admin: Login;

  async function login(name: string, role: 'staff' | 'admin'): Promise<Login> {
    const email = `${name}@case-notes.example.test`;
    const user = await ctx.db.user.create({
      data: {
        organizationId: ctx.organizationId,
        email,
        name,
        role,
        passwordHash: await hash('Synthetic-password-2026'),
      },
    });
    const response = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Synthetic-password-2026' });
    expect(response.status).toBe(200);
    return {
      cookie: ([] as string[]).concat(response.headers['set-cookie']),
      csrf: response.body.csrfToken,
      userId: user.id,
    };
  }
  async function renew(who: Login, name: string): Promise<Login> {
    const response = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${name}@case-notes.example.test`, password: 'Synthetic-password-2026' });
    expect(response.status).toBe(200);
    return {
      cookie: ([] as string[]).concat(response.headers['set-cookie']),
      csrf: response.body.csrfToken,
      userId: who.userId,
    };
  }
  const create = (who: Login, member: string, body: object) =>
    request(ctx.app.getHttpServer())
      .post(`/api/members/${member}/case-notes`)
      .set('Cookie', who.cookie)
      .set('X-CSRF-Token', who.csrf)
      .send(body);
  const edit = (who: Login, note: string, body: object) =>
    request(ctx.app.getHttpServer())
      .patch(`/api/case-notes/${note}`)
      .set('Cookie', who.cookie)
      .set('X-CSRF-Token', who.csrf)
      .send(body);
  const list = (who: Login, member: string) =>
    request(ctx.app.getHttpServer())
      .get(`/api/members/${member}/case-notes`)
      .set('Cookie', who.cookie);
  const history = (who: Login, note: string) =>
    request(ctx.app.getHttpServer())
      .get(`/api/case-notes/${note}/history`)
      .set('Cookie', who.cookie);
  const remove = (who: Login, note: string) =>
    request(ctx.app.getHttpServer())
      .delete(`/api/case-notes/${note}`)
      .set('Cookie', who.cookie)
      .set('X-CSRF-Token', who.csrf);

  beforeAll(async () => {
    ctx = await createTestApp();
    const member = await ctx.db.member.create({
      data: { organizationId: ctx.organizationId, firstName: 'สมาชิก', lastName: 'สมมติ' },
    });
    memberId = member.id;
    author = await login('author', 'staff');
    colleague = await login('colleague', 'staff');
    admin = await login('admin', 'admin');
  });
  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  it('creates an encrypted initial revision and lists only current text with author and time', async () => {
    const secret = 'แรกเริ่ม ข้อความที่ต้องปกปิด';
    const saved = await create(author, memberId, { body: secret });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({
      memberId,
      body: secret,
      authorId: author.userId,
      currentVersion: 1,
    });
    expect(saved.body.createdAt).toBeTruthy();
    const notes = await list(colleague, memberId);
    expect(notes.status).toBe(200);
    expect(notes.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: saved.body.id, body: secret })]),
    );
    const revisions = await history(colleague, saved.body.id);
    expect(revisions.status).toBe(200);
    expect(revisions.body).toEqual([
      expect.objectContaining({ version: 1, body: secret, createdBy: author.userId }),
    ]);
    const rows = await ctx.db.$queryRaw<Array<{ note: unknown; revision: unknown }>>`
      SELECT to_jsonb(n) note, to_jsonb(r) revision FROM case_notes n
      JOIN case_note_revisions r ON r.case_note_id = n.id
      WHERE n.id = ${saved.body.id}`;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(secret);
    const audits = await ctx.db.auditLog.findMany({
      where: { organizationId: ctx.organizationId, entityId: saved.body.id },
    });
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(['case_note.create', 'case_note.history_view']),
    );
    expect(JSON.stringify(audits)).not.toContain(secret);
  });

  it('appends encrypted revisions and preserves each historical text', async () => {
    const saved = await create(author, memberId, { body: 'original private note' });
    expect(saved.status).toBe(201);
    const edited = await edit(author, saved.body.id, { body: 'corrected private note' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ body: 'corrected private note', currentVersion: 2 });
    const revisions = await history(author, saved.body.id);
    expect(revisions.body.map((r: { body: string }) => r.body)).toEqual([
      'original private note',
      'corrected private note',
    ]);
    expect(revisions.body.map((r: { version: number }) => r.version)).toEqual([1, 2]);
    const rows = await ctx.db.$queryRaw<Array<{ note: unknown; revision: unknown }>>`
      SELECT to_jsonb(n) note, to_jsonb(r) revision FROM case_notes n
      JOIN case_note_revisions r ON r.case_note_id = n.id
      WHERE n.id = ${saved.body.id}`;
    expect(JSON.stringify(rows)).not.toContain('private note');
    const audits = await ctx.db.auditLog.findMany({
      where: { organizationId: ctx.organizationId, entityId: saved.body.id },
    });
    expect(audits.find((a) => a.action === 'case_note.edit')?.fields).toEqual(['body']);
    expect(JSON.stringify(audits)).not.toContain('corrected private note');
  });

  it('allows own edit before 24 hours but refuses at exactly 24 hours from original creation', async () => {
    ctx.clock.set('2026-10-17T03:00:00.000Z');
    const saved = await create(author, memberId, { body: 'first' });
    expect(saved.status).toBe(201);
    ctx.clock.set('2026-10-18T02:00:00.000Z');
    author = await renew(author, 'author');
    expect((await edit(author, saved.body.id, { body: 'hour 23' })).status).toBe(200);
    ctx.clock.set('2026-10-18T03:00:00.000Z');
    author = await renew(author, 'author');
    const denied = await edit(author, saved.body.id, { body: 'hour 24' });
    expect(denied.status).toBe(403);
    const revisions = await history(author, saved.body.id);
    expect(revisions.body.map((r: { body: string }) => r.body)).toEqual(['first', 'hour 23']);
    ctx.clock.set('2026-10-17T03:00:00.000Z');
  });

  it('refuses edits by a different author, including an admin', async () => {
    const saved = await create(author, memberId, { body: 'author only' });
    expect(saved.status).toBe(201);
    expect((await edit(colleague, saved.body.id, { body: 'staff intrusion' })).status).toBe(403);
    expect((await edit(admin, saved.body.id, { body: 'admin intrusion' })).status).toBe(403);
    expect((await history(author, saved.body.id)).body).toHaveLength(1);
  });

  it('serializes simultaneous edits into distinct increasing revisions', async () => {
    const saved = await create(author, memberId, { body: 'start' });
    expect(saved.status).toBe(201);
    const updates = await Promise.all([
      edit(author, saved.body.id, { body: 'parallel A' }),
      edit(author, saved.body.id, { body: 'parallel B' }),
    ]);
    expect(updates.map((r) => r.status)).toEqual([200, 200]);
    const revisions = await history(author, saved.body.id);
    expect(revisions.body.map((r: { version: number }) => r.version)).toEqual([1, 2, 3]);
    expect(
      revisions.body
        .slice(1)
        .map((r: { body: string }) => r.body)
        .sort(),
    ).toEqual(['parallel A', 'parallel B']);
    const notes = await list(author, memberId);
    expect(notes.body.find((n: { id: string }) => n.id === saved.body.id).currentVersion).toBe(3);
  });

  it('allows only an admin to soft-delete a note and hides its history thereafter', async () => {
    const saved = await create(author, memberId, { body: 'delete me' });
    expect(saved.status).toBe(201);
    expect((await remove(author, saved.body.id)).status).toBe(403);
    expect((await remove(admin, saved.body.id)).status).toBe(204);
    expect((await history(admin, saved.body.id)).status).toBe(404);
    expect(
      (await list(admin, memberId)).body.some((n: { id: string }) => n.id === saved.body.id),
    ).toBe(false);
    const row = await ctx.db.$queryRaw<
      Array<{ deleted_at: Date }>
    >`SELECT deleted_at FROM case_notes WHERE id = ${saved.body.id}`;
    expect(row[0]?.deleted_at).toBeTruthy();
    const revisions = await ctx.db.$queryRaw<
      Array<{ version: number }>
    >`SELECT version FROM case_note_revisions WHERE case_note_id = ${saved.body.id}`;
    expect(revisions).toHaveLength(1);
  });

  it('rejects another organization member and note in every route', async () => {
    const otherOrg = randomUUID();
    await ctx.db.organization.create({ data: { id: otherOrg, name: 'Other synthetic' } });
    try {
      const otherMember = await ctx.db.member.create({
        data: { organizationId: otherOrg, firstName: 'Other', lastName: 'Person' },
      });
      expect((await create(author, otherMember.id, { body: 'cross org' })).status).toBe(404);
      expect((await list(author, otherMember.id)).status).toBe(404);
      const own = await create(author, memberId, { body: 'own' });
      expect(own.status).toBe(201);
      // A foreign session cannot be forged through client-supplied organization IDs.
      expect(
        (await create(author, memberId, { body: 'forged', organizationId: otherOrg })).status,
      ).toBe(422);
      expect(
        (await edit(author, own.body.id, { body: 'forged', organizationId: otherOrg })).status,
      ).toBe(422);
    } finally {
      await ctx.db.organization.delete({ where: { id: otherOrg } });
    }
  });

  it('bounds input and keeps case-note routes inaccessible without a staff session', async () => {
    expect((await create(author, memberId, { body: '' })).status).toBe(422);
    expect((await create(author, memberId, { body: 'x'.repeat(10001) })).status).toBe(422);
    expect((await create(author, memberId, { body: 23 })).status).toBe(422);
    expect(
      (await request(ctx.app.getHttpServer()).get(`/api/members/${memberId}/case-notes`)).status,
    ).toBe(401);
    expect(
      (await request(ctx.app.getHttpServer()).get(`/api/case-notes/${randomUUID()}/history`))
        .status,
    ).toBe(401);
  });

  it('refuses a participant actor before decrypting note history', async () => {
    const saved = await create(author, memberId, { body: 'staff-only history' });
    expect(saved.status).toBe(201);
    const participant = {
      kind: 'member' as const,
      organizationId: ctx.organizationId,
      lineAccountId: randomUUID(),
    };
    await expect(
      ctx.app.get(CaseNotes).history(participant as unknown as StaffActor, saved.body.id),
    ).rejects.toMatchObject({ status: 403 });
  });
});
