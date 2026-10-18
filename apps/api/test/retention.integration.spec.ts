import { createTestApp, type TestApp } from './test-app.js';
import { Retention } from '../src/jobs/retention.job.js';
import { Scheduler } from '../src/jobs/scheduler.js';
import { Documents } from '../src/documents/documents.service.js';
import { FieldCrypto } from '../src/crypto/field-crypto.js';
import { FileStore } from '../src/documents/file-store.js';
import { login, makeRun, paperMember, register, staffCaller } from './helpers.js';

const DAY = 86400000;
describe('retention and cleanup jobs', () => {
  let ctx: TestApp;
  let s: ReturnType<typeof staffCaller>;
  let admin: ReturnType<typeof staffCaller>;
  const at = (days: number) => new Date(ctx.clock.now().getTime() + days * DAY);
  const crypto = () => ctx.app.get(FieldCrypto);
  const request_ = (extra: object) => ctx.db.signupRequest.create({ data: { organizationId: ctx.organizationId, submittedDataEncrypted: crypto().encrypt('{}') as never, consentsEncrypted: crypto().encrypt('[]') as never, candidateMemberIds: [], ...extra } });
  const heldFile = async (signupRequestId: string) => {
    const key = await ctx.app.get(FileStore).put(ctx.organizationId, Buffer.from('file-bytes'));
    return ctx.db.memberDocument.create({ data: { organizationId: ctx.organizationId, signupRequestId, kind: 'online', fileKeyEncrypted: key as never, mime: 'image/png', size: 10, uploadedByKind: 'member', uploadedById: 'x' } });
  };
  beforeAll(async () => {
    ctx = await createTestApp();
    s = staffCaller(ctx, await login(ctx, 'ret-staff@example.test'));
    admin = staffCaller(ctx, await login(ctx, 'ret-admin@example.test', 'admin'));
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('purges rejected and abandoned signup requests, with their held files, after 30 days', async () => {
    const now = ctx.clock.now();
    const rejectedOld = await request_({ status: 'rejected', resolvedAt: at(-31) });
    const rejectedNew = await request_({ status: 'rejected', resolvedAt: at(-29) });
    const pendingOld = await request_({ createdAt: at(-31) });
    const pendingNew = await request_({ createdAt: at(-5) });
    const linkedOld = await request_({ status: 'linked', resolvedAt: at(-90) });
    const doc = await heldFile(rejectedOld.id);
    const keep = await heldFile(pendingNew.id);
    const stored = ctx.app.get(FileStore);
    const result = await ctx.app.get(Retention).purge(now, ctx.organizationId);
    expect(result.signupRequests).toBe(2);
    for (const gone of [rejectedOld, pendingOld]) expect(await ctx.db.signupRequest.findUnique({ where: { id: gone.id } })).toBeNull();
    for (const kept of [rejectedNew, pendingNew, linkedOld]) expect(await ctx.db.signupRequest.findUnique({ where: { id: kept.id } })).not.toBeNull();
    expect(await ctx.db.memberDocument.findUnique({ where: { id: doc.id } })).toBeNull();
    expect(await ctx.db.memberDocument.findUnique({ where: { id: keep.id } })).not.toBeNull();
    await expect(stored.get(keep.fileKeyEncrypted as never)).resolves.toEqual(Buffer.from('file-bytes'));
    await expect(stored.get(doc.fileKeyEncrypted as never)).rejects.toThrow();
  });

  it('removes unsubmitted drafts after 24 hours but never committed files', async () => {
    const draft = await ctx.db.signupDraft.create({ data: { organizationId: ctx.organizationId, ownerKind: 'line', ownerId: 'x', tokenHash: `h-${Math.random()}`, expiresAt: at(-1) } });
    const committed = await ctx.db.signupDraft.create({ data: { organizationId: ctx.organizationId, ownerKind: 'line', ownerId: 'y', tokenHash: `h-${Math.random()}`, expiresAt: at(-1), consumedAt: at(-2) } });
    expect(await ctx.app.get(Documents).cleanupExpiredDrafts(ctx.clock.now())).toBeGreaterThanOrEqual(1);
    expect(await ctx.db.signupDraft.findUnique({ where: { id: draft.id } })).toBeNull();
    expect(await ctx.db.signupDraft.findUnique({ where: { id: committed.id } })).not.toBeNull();
  });

  it('never purges members while retention is unset, and purges only soft-deleted ones once it is set', async () => {
    const deleted = await paperMember(ctx, 'ลบนานแล้ว');
    const recentlyDeleted = await paperMember(ctx, 'เพิ่งลบ');
    const active = await paperMember(ctx, 'ยังใช้งาน');
    const { runId } = await makeRun(ctx, s, { capacity: 5, closes: '2026-12-01T00:00:00.000Z' });
    await register(s, runId, deleted.id);
    await register(s, runId, active.id);
    await ctx.db.member.update({ where: { id: deleted.id }, data: { deletedAt: at(-400) } });
    await ctx.db.member.update({ where: { id: recentlyDeleted.id }, data: { deletedAt: at(-10) } });
    const before = await ctx.db.member.count({ where: { organizationId: ctx.organizationId } });
    const unset = await ctx.app.get(Retention).purge(ctx.clock.now(), ctx.organizationId);
    expect(unset.members).toBe(0);
    expect(await ctx.db.member.count({ where: { organizationId: ctx.organizationId } })).toBe(before);
    expect((await admin('patch', '/api/settings/organization', { retention: { generalDays: 365 } })).status).toBe(200);
    const set = await ctx.app.get(Retention).purge(ctx.clock.now(), ctx.organizationId);
    expect(set.members).toBe(1);
    expect(await ctx.db.member.findUnique({ where: { id: deleted.id } })).toBeNull();
    expect(await ctx.db.registration.count({ where: { memberId: deleted.id } })).toBe(0);
    for (const kept of [recentlyDeleted, active]) expect(await ctx.db.member.findUnique({ where: { id: kept.id } })).not.toBeNull();
    expect(await ctx.db.registration.count({ where: { memberId: active.id } })).toBe(1);
  });

  it('runs once per day from the scheduler at or after 03:00 Bangkok', async () => {
    const scheduler = ctx.app.get(Scheduler);
    const marker = () => ctx.db.operationRecord.count({ where: { organizationId: ctx.organizationId, key: { startsWith: 'job:retention:' } } });
    const before = await marker();
    await scheduler.tick(new Date('2026-10-30T19:30:00.000Z'));
    expect(await marker()).toBe(before);
    await scheduler.tick(new Date('2026-10-30T20:00:00.000Z'));
    expect(await marker()).toBe(before + 1);
    await scheduler.tick(new Date('2026-10-30T22:00:00.000Z'));
    expect(await marker()).toBe(before + 1);
  });
});
