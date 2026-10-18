import { randomUUID } from 'node:crypto';
import { createTestApp, type TestApp } from './test-app.js';
import { Outbox } from '../src/notifications/outbox.service.js';

describe('transactional notification outbox', () => {
  let ctx: TestApp;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { if (ctx) await ctx.close(); });
  it('rolls back with its business transaction and deduplicates a stable event ID', async () => {
    const outbox = ctx.app.get(Outbox);
    const member = await ctx.db.member.create({ data: { organizationId: ctx.organizationId, firstName: 'แจ้ง', lastName: 'ทดสอบ' } });
    const event = { eventId: randomUUID(), kind: 'signup.created' as const, recipient: { kind: 'member' as const, memberId: member.id }, entityRefs: { memberIds: [member.id] } };
    await expect(ctx.db.$transaction(async (tx) => {
      await outbox.enqueue(tx, { kind: 'system', organizationId: ctx.organizationId }, event);
      throw new Error('business rollback');
    })).rejects.toThrow('business rollback');
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, eventId: event.eventId } })).toBe(0);
    await ctx.db.$transaction(async (tx) => {
      await outbox.enqueue(tx, { kind: 'system', organizationId: ctx.organizationId }, event);
      await outbox.enqueue(tx, { kind: 'system', organizationId: ctx.organizationId }, event);
    });
    expect(await ctx.db.notification.count({ where: { organizationId: ctx.organizationId, eventId: event.eventId } })).toBe(1);
    const stored = await ctx.db.notification.findFirstOrThrow({ where: { organizationId: ctx.organizationId, eventId: event.eventId } });
    expect(JSON.stringify(stored)).not.toContain('แจ้ง');
  });
});
