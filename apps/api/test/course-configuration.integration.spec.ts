import { createTestApp, type TestApp } from './test-app.js';
import { http, joinLine, key, lineHeader, login, makeRun, paperMember, register, serviceType, session, staffCaller, type Session } from './helpers.js';

describe('course, run, session and question configuration', () => {
  let ctx: TestApp;
  let admin: Session;
  let staff: Session;
  let a: ReturnType<typeof staffCaller>;
  let s: ReturnType<typeof staffCaller>;
  let serviceId: string;
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await login(ctx, 'cfg-admin@example.test', 'admin');
    staff = await login(ctx, 'cfg-staff@example.test', 'staff');
    a = staffCaller(ctx, admin);
    s = staffCaller(ctx, staff);
    serviceId = await serviceType(ctx);
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  const q = (label: string, type: string, extra: object = {}) => ({ label, type, required: false, sensitive: false, ...extra });
  const opts = (...labels: string[]) => labels.map((label) => ({ label }));

  it('copies course questions into a run and keeps the run independent of later edits', async () => {
    const lib = await s('post', '/api/question-library', q('อาหารที่แพ้', 'paragraph', { sensitive: true }));
    expect(lib.status).toBe(201);
    const course = await s('post', '/api/courses', { name: 'คอร์สคำถาม', serviceTypeIds: [serviceId] });
    expect(course.body.serviceTypeIds).toEqual([serviceId]);
    const set = await s('put', `/api/courses/${course.body.id}/questions`, { questions: [q('ชื่อเล่น', 'short_text', { required: true }), { ...q('อาหารที่แพ้', 'paragraph', { sensitive: true }), libraryQuestionId: lib.body.id }] });
    expect(set.status).toBe(200);
    expect(set.body.map((x: { label: string }) => x.label)).toEqual(['ชื่อเล่น', 'อาหารที่แพ้']);
    const run = await s('post', `/api/courses/${course.body.id}/runs`, { batchName: 'รุ่น 1', capacity: 5, requireApproval: false, waitlistEnabled: true, perSessionRegistration: false, cancelDeadlineDays: 7, sessions: [session('2026-12-01')] });
    expect(run.status).toBe(201);
    const copied = run.body.questions as Array<{ id: string; label: string; sensitive: boolean }>;
    expect(copied.map((x) => x.label)).toEqual(['ชื่อเล่น', 'อาหารที่แพ้']);
    expect(copied[1]!.sensitive).toBe(true);
    // Course, library and later edits never rewrite the existing run.
    await s('patch', `/api/question-library/${lib.body.id}`, { label: 'แก้ไขคลัง' });
    await s('put', `/api/courses/${course.body.id}/questions`, { questions: [q('คำถามใหม่ในคอร์ส', 'date')] });
    const again = await s('get', `/api/runs/${run.body.id}`);
    expect(again.body.questions.map((x: { label: string }) => x.label)).toEqual(['ชื่อเล่น', 'อาหารที่แพ้']);
    expect(again.body.questions.map((x: { id: string }) => x.id)).toEqual(copied.map((x) => x.id));
    expect((await s('post', `/api/courses/${course.body.id}/runs`, { batchName: 'รุ่น 2', capacity: 5, requireApproval: false, waitlistEnabled: true, perSessionRegistration: false, cancelDeadlineDays: 7, sessions: [session('2026-12-05')] })).body.questions.map((x: { label: string }) => x.label)).toEqual(['คำถามใหม่ในคอร์ส']);
  });

  it('validates answers for all six question types', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 50 });
    const types = [q('ข้อความสั้น', 'short_text', { required: true }), q('ย่อหน้า', 'paragraph'), q('เลือกหนึ่ง', 'single_choice', { options: opts('ก', 'ข') }), q('ดรอปดาวน์', 'dropdown', { options: opts('ค', 'ง') }), q('เลือกหลายข้อ', 'checkboxes', { options: opts('จ', 'ฉ', 'ช') }), q('วันที่', 'date')];
    const put = await s('put', `/api/runs/${runId}/questions`, { questions: types });
    expect(put.status).toBe(200);
    const [t, p, single, drop, multi, date] = put.body.questions as Array<{ id: string; options: Array<{ id: string }> }>;
    const member = await paperMember(ctx, 'ตอบคำถาม');
    const good = { [t!.id]: 'สวัสดี', [p!.id]: 'ยาวหน่อย', [single!.id]: single!.options[0]!.id, [drop!.id]: drop!.options[1]!.id, [multi!.id]: [multi!.options[0]!.id, multi!.options[2]!.id], [date!.id]: '2026-12-31' };
    const cases: Array<[string, object]> = [
      ['missing required', { ...good, [t!.id]: '' }], ['choice not in options', { ...good, [single!.id]: 'nope' }], ['checkbox not array', { ...good, [multi!.id]: multi!.options[0]!.id }],
      ['checkbox duplicates', { ...good, [multi!.id]: [multi!.options[0]!.id, multi!.options[0]!.id] }], ['bad date', { ...good, [date!.id]: '2026-02-30' }], ['unknown question', { ...good, ghost: 'x' }],
    ];
    for (const [label, answers] of cases) {
      const response = await register(s, runId, member.id, { answers });
      expect([label, response.status]).toEqual([label, 422]);
    }
    expect((await register(s, runId, member.id, { answers: good })).status).toBe(201);
  });

  it('locks structure after the first booking, even a waitlisted one, and keeps it locked', async () => {
    const { runId, sessionIds } = await makeRun(ctx, s, { capacity: 1, requireApproval: false });
    const first = await paperMember(ctx, 'คนแรก');
    const second = await paperMember(ctx, 'คนที่สอง');
    expect((await s('patch', `/api/runs/${runId}`, { requireApproval: true })).status).toBe(200);
    await register(s, runId, first.id);
    const waitlisted = await register(s, runId, second.id);
    expect(waitlisted.body.outcomes[0].status).toBe('waitlisted');
    for (const [patch, label] of [[{ perSessionRegistration: true }, 'mode'], [{ requireApproval: false }, 'approval']] as const) {
      const r = await s('patch', `/api/runs/${runId}`, patch);
      expect([label, r.status, r.body.code]).toEqual([label, 409, 'RUN_LOCKED']);
    }
    expect((await s('post', `/api/runs/${runId}/sessions`, session('2026-11-20'))).status).toBe(409);
    expect((await s('delete', `/api/sessions/${sessionIds[0]}`)).status).toBe(409);
    // Cancel both bookings: the lock stays.
    const rows = (await s('get', `/api/runs/${runId}/registrations`)).body.items as Array<{ id: string }>;
    for (const row of rows) expect((await s('post', `/api/registrations/${row.id}/cancel`, { reason: 'ทดสอบ', operationKey: key() })).status).toBe(200);
    expect((await s('post', `/api/runs/${runId}/sessions`, session('2026-11-20'))).status).toBe(409);
    expect((await s('patch', `/api/runs/${runId}`, { perSessionRegistration: true })).status).toBe(409);
    expect((await s('patch', `/api/runs/${runId}`, { location: 'ห้องใหม่', waitlistEnabled: false })).status).toBe(200);
  });

  it('after a booking allows wording, order, optional additions and appended options only', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 10 });
    const first = await s('put', `/api/runs/${runId}/questions`, { questions: [q('เลือกอาหาร', 'single_choice', { options: opts('ไก่', 'หมู'), required: true }), q('หมายเหตุ', 'short_text')] });
    const [choice, note] = first.body.questions as Array<{ id: string; options: Array<{ id: string; label: string }> }>;
    const member = await paperMember(ctx, 'ล็อกฟอร์ม');
    expect((await register(s, runId, member.id, { answers: { [choice!.id]: choice!.options[0]!.id } })).status).toBe(201);
    const keep = (extra: object[] = [], mutate: (x: object) => object = (x) => x) => ({ questions: [mutate({ id: choice!.id, label: 'อาหารที่ชอบ', type: 'single_choice', required: true, sensitive: false, options: [...choice!.options, { label: 'ปลา' }] }), { id: note!.id, label: 'หมายเหตุ', type: 'short_text', required: false, sensitive: false }, ...extra] });
    const ok = await s('put', `/api/runs/${runId}/questions`, keep([q('ถามเพิ่ม (ไม่บังคับ)', 'short_text')]));
    expect(ok.status).toBe(200);
    expect(ok.body.questions.map((x: { label: string }) => x.label)).toEqual(['อาหารที่ชอบ', 'หมายเหตุ', 'ถามเพิ่ม (ไม่บังคับ)']);
    expect(ok.body.questions[0].options.map((o: { label: string }) => o.label)).toEqual(['ไก่', 'หมู', 'ปลา']);
    const blocked: Array<[string, object]> = [
      ['required addition', keep([q('บังคับใหม่', 'short_text', { required: true })])],
      ['type change', keep([], (x) => ({ ...x, type: 'dropdown' }))],
      ['option removal', keep([], (x) => ({ ...x, options: [{ ...choice!.options[0] }] }))],
      ['sensitive flag change', keep([], (x) => ({ ...x, sensitive: true }))],
      ['question removal', { questions: [{ id: choice!.id, label: 'x', type: 'single_choice', required: true, sensitive: false, options: choice!.options }] }],
    ];
    for (const [label, body] of blocked) { const r = await s('put', `/api/runs/${runId}/questions`, body); expect([label, r.status, r.body.code]).toEqual([label, 409, 'RUN_LOCKED']); }
  });

  it('validates run and session input', async () => {
    const course = await s('post', '/api/courses', { name: 'ตรวจข้อมูลรอบ' });
    const base = { batchName: 'รุ่น', capacity: 5, requireApproval: false, waitlistEnabled: true, perSessionRegistration: false, cancelDeadlineDays: 7, sessions: [session('2026-12-01')] };
    const attempts: Array<[string, object]> = [
      ['no name', { ...base, batchName: ' ' }], ['zero capacity', { ...base, capacity: 0 }], ['no sessions', { ...base, sessions: [] }],
      ['end before start', { ...base, sessions: [{ ...session('2026-12-01'), startTime: '12:00', endTime: '09:00' }] }],
      ['bad date', { ...base, sessions: [session('2026-13-01')] }], ['close before open', { ...base, registrationOpensAt: '2026-11-02T00:00:00Z', registrationClosesAt: '2026-11-01T00:00:00Z' }],
      ['per-session without capacity', { ...base, perSessionRegistration: true, capacity: null, sessions: [session('2026-12-01')] }], ['negative deadline', { ...base, cancelDeadlineDays: -1 }],
    ];
    for (const [label, body] of attempts) expect([label, (await s('post', `/api/courses/${course.body.id}/runs`, body)).status]).toEqual([label, 422]);
    expect((await s('patch', `/api/runs/${(await makeRun(ctx, s)).runId}`, { capacity: 3, hacker: true })).status).toBe(422);
  });

  it('lets only admins delete, and only runs without active registrations', async () => {
    const { runId, courseId } = await makeRun(ctx, s, { capacity: 3 });
    const member = await paperMember(ctx, 'ลบรอบ');
    await register(s, runId, member.id);
    expect((await s('delete', `/api/runs/${runId}`)).status).toBe(403);
    expect((await s('delete', `/api/courses/${courseId}`)).status).toBe(403);
    const blocked = await a('delete', `/api/runs/${runId}`);
    expect([blocked.status, blocked.body.code]).toEqual([409, 'CANCEL_FIRST']);
    expect((await a('post', `/api/runs/${runId}/cancel`, { reason: 'ยกเลิกรอบ' })).status).toBe(200);
    expect((await a('delete', `/api/courses/${courseId}`)).status).toBe(200);
    expect((await s('get', `/api/courses/${courseId}`)).status).toBe(404);
    expect((await s('get', `/api/runs/${runId}`)).status).toBe(404);
    expect(await ctx.db.registration.count({ where: { runId } })).toBe(1);
  });

  it('shows members only open runs with availability words, not seat numbers', async () => {
    const { runId } = await makeRun(ctx, s, { capacity: 1, waitlistEnabled: true });
    await joinLine(ctx, 'cfg-view1', 'ดูรอบ', 'หนึ่ง', '1980-01-01', serviceId);
    const list = await http(ctx).get('/api/member/courses').set(lineHeader('cfg-view1'));
    const item = list.body.items.find((x: { runId: string }) => x.runId === runId);
    expect(item.availability).toBe('available');
    expect(JSON.stringify(item)).not.toMatch(/capacity|reserved/);
    expect((await http(ctx).get('/api/member/courses')).status).toBe(401);
    void key;
  });
});
