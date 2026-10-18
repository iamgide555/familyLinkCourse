import { createTestApp, type TestApp } from './test-app.js';
import { http, joinLine, key, lineHeader, login, makeRun, paperMember, register, serviceType, staffCaller } from './helpers.js';

describe('immutable registration snapshots and rejoining', () => {
  let ctx: TestApp;
  let s: ReturnType<typeof staffCaller>;
  let serviceId: string;
  beforeAll(async () => {
    ctx = await createTestApp();
    s = staffCaller(ctx, await login(ctx, 'snap-staff@example.test'));
    serviceId = await serviceType(ctx);
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  const withQuestions = async (setup: Parameters<typeof makeRun>[2]) => {
    const made = await makeRun(ctx, s, setup);
    const put = await s('put', `/api/runs/${made.runId}/questions`, { questions: [
      { label: 'ชื่อเล่น', type: 'short_text', required: true, sensitive: false },
      { label: 'โรคประจำตัว', type: 'paragraph', required: false, sensitive: true },
    ] });
    const [nick, health] = put.body.questions as Array<{ id: string }>;
    return { ...made, nick: nick!.id, health: health!.id };
  };
  const detail = async (registrationId: string) => (await s('get', `/api/registrations/${registrationId}`)).body;

  it('a rejoin appends a new version and leaves the earlier answers untouched', async () => {
    const { runId, nick, health } = await withQuestions({ capacity: 5 });
    const member = await paperMember(ctx, 'เข้าซ้ำ');
    const first = await register(s, runId, member.id, { answers: { [nick]: 'เอ', [health]: 'ความดันสูง' } });
    const id = first.body.registrationId as string;
    expect((await s('post', `/api/registrations/${id}/cancel`, { reason: 'ติดธุระ', operationKey: key() })).status).toBe(200);
    // Member details change between submissions; the old snapshot must not follow.
    await ctx.db.member.update({ where: { id: member.id }, data: { phoneMobile: '0899990000' } });
    const second = await register(s, runId, member.id, { answers: { [nick]: 'บี' } });
    expect(second.status).toBe(201);
    expect(second.body.registrationId).toBe(id);
    const view = await detail(id);
    expect(view.history.map((h: { version: number }) => h.version)).toEqual([1, 2]);
    expect(view.history[0].answers).toEqual({ [nick]: 'เอ', [health]: 'ความดันสูง' });
    expect(view.history[1].answers).toEqual({ [nick]: 'บี' });
    expect(view.current.version).toBe(2);
    expect(view.history[0].member.phoneMobile).toBe('');
    expect(view.history[1].member.phoneMobile).toBe('0899990000');
    expect(view.history[0].questions.map((q: { label: string }) => q.label)).toEqual(['ชื่อเล่น', 'โรคประจำตัว']);
    expect(await ctx.db.registration.count({ where: { runId } })).toBe(1);
  });

  it('keeps answers and audit logs from leaking plaintext', async () => {
    const { runId, nick, health } = await withQuestions({ capacity: 5 });
    const member = await paperMember(ctx, 'ความลับ', '1972-02-02', 'secret@example.test');
    const reg = await register(s, runId, member.id, { answers: { [nick]: 'ชื่อลับเฉพาะ', [health]: 'ข้อมูลสุขภาพลับ' } });
    const rows = await ctx.db.registrationSnapshot.findMany({ where: { registrationId: reg.body.registrationId } });
    expect(JSON.stringify(rows)).not.toContain('ข้อมูลสุขภาพลับ');
    expect(JSON.stringify(rows)).not.toContain('ชื่อลับเฉพาะ');
    const logs = await ctx.db.auditLog.findMany({ where: { organizationId: ctx.organizationId } });
    expect(JSON.stringify(logs)).not.toContain('ข้อมูลสุขภาพลับ');
    const view = await detail(reg.body.registrationId);
    expect(view.current.answers[health]).toBe('ข้อมูลสุขภาพลับ');
    const note = await ctx.db.notification.findFirstOrThrow({ where: { organizationId: ctx.organizationId, recipientId: member.id } });
    expect(JSON.stringify(note)).not.toContain('ข้อมูลสุขภาพลับ');
  });

  it('prefills a rejoining member with their previous answers for still-existing questions', async () => {
    const { runId, nick } = await withQuestions({ capacity: 5 });
    const memberId = await joinLine(ctx, 'snap-prefill', 'เติมคำตอบ', 'เดิม', '1984-04-04', serviceId);
    const body = (answers: object) => ({ runId, sessionIds: [], answers, operationKey: key() });
    const first = await http(ctx).post(`/api/member/me/${memberId}/registrations`).set(lineHeader('snap-prefill')).send(body({ [nick]: 'คำตอบเดิม' }));
    expect(first.status).toBe(201);
    const none = await http(ctx).get(`/api/member/courses/${runId}`).query({ memberId }).set(lineHeader('snap-prefill'));
    expect(none.body.prefill).toEqual({ [nick]: 'คำตอบเดิม' });
    expect(none.body.registration.summary).toBe('ยืนยันแล้ว');
    expect((await http(ctx).get(`/api/member/courses/${runId}`).query({ memberId }).set(lineHeader('snap-other'))).status).toBe(404);
  });

  it('versions only newly submitted sessions in per-session mode', async () => {
    const { runId, sessionIds, nick } = await withQuestions({ perSession: true, capacity: 3 });
    const member = await paperMember(ctx, 'หลายวัน');
    const first = await register(s, runId, member.id, { sessionIds: [sessionIds[0]!], answers: { [nick]: 'ครั้งแรก' } });
    const second = await register(s, runId, member.id, { sessionIds: [sessionIds[1]!], answers: { [nick]: 'ครั้งสอง' } });
    expect(second.body.registrationId).toBe(first.body.registrationId);
    const entries = await ctx.db.registrationSession.findMany({ where: { registrationId: first.body.registrationId } });
    const snaps = await ctx.db.registrationSnapshot.findMany({ where: { registrationId: first.body.registrationId }, orderBy: { version: 'asc' } });
    expect(snaps.map((x) => x.version)).toEqual([1, 2]);
    expect(entries.find((e) => e.sessionId === sessionIds[0])!.snapshotId).toBe(snaps[0]!.id);
    expect(entries.find((e) => e.sessionId === sessionIds[1])!.snapshotId).toBe(snaps[1]!.id);
    // Registering a session that is already active is refused and creates nothing.
    expect((await register(s, runId, member.id, { sessionIds: [sessionIds[1]!], answers: { [nick]: 'ซ้ำ' } })).status).toBe(409);
    expect(await ctx.db.registrationSnapshot.count({ where: { registrationId: first.body.registrationId } })).toBe(2);
    const view = await detail(first.body.registrationId);
    expect(view.registration.entries.map((e: { status: string }) => e.status)).toEqual(['confirmed', 'confirmed']);
  });

  it('a refused submission neither replaces nor adds a snapshot', async () => {
    const { runId, nick } = await withQuestions({ capacity: 1, waitlistEnabled: false });
    const [a, b] = [await paperMember(ctx, 'คนเก่า'), await paperMember(ctx, 'คนแย่งที่')];
    const first = await register(s, runId, a.id, { answers: { [nick]: 'เดิม' } });
    await s('post', `/api/registrations/${first.body.registrationId}/cancel`, { reason: 'ออก', operationKey: key() });
    expect((await register(s, runId, b.id, { answers: { [nick]: 'ใหม่' } })).status).toBe(201);
    const refused = await register(s, runId, a.id, { answers: { [nick]: 'พยายามกลับมา' } });
    expect([refused.status, refused.body.code]).toEqual([409, 'RUN_FULL']);
    expect(await ctx.db.registrationSnapshot.count({ where: { registrationId: first.body.registrationId } })).toBe(1);
    expect((await ctx.db.registration.findUniqueOrThrow({ where: { id: first.body.registrationId } })).status).toBe('cancelled');
  });
});
