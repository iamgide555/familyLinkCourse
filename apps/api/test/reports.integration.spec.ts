import ExcelJS from 'exceljs';
import { createTestApp, type TestApp } from './test-app.js';
import { key, login, makeRun, paperMember, register, staffCaller } from './helpers.js';

const binary = (res: NodeJS.ReadableStream, cb: (e: Error | null, b: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Excel exports', () => {
  let ctx: TestApp;
  let admin: ReturnType<typeof staffCaller>;
  let staff: ReturnType<typeof staffCaller>;
  let lastCitizen = '';
  const sheetOf = async (caller: typeof admin, path: string) => {
    const response = await caller('get', path).buffer(true).parse(binary as never);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect(response.headers['content-disposition']).toContain('attachment');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(response.body as never);
    const ws = wb.worksheets[0]!;
    const headers = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    const rows = Array.from({ length: ws.rowCount - 1 }, (_, i) => ws.getRow(i + 2));
    const cell = (row: ExcelJS.Row, header: string) => row.getCell(headers.indexOf(header) + 1);
    return { headers, rows, cell };
  };
  const exportsLogged = (action: string) => ctx.db.auditLog.count({ where: { organizationId: ctx.organizationId, action } });
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = staffCaller(ctx, await login(ctx, 'rep-admin@example.test', 'admin'));
    staff = staffCaller(ctx, await login(ctx, 'rep-staff@example.test', 'staff'));
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  let serial = 0;
  const citizenId = () => {
    const base = `11017002${String(++serial).padStart(4, '0')}`;
    const sum = [...base].reduce((n, c, i) => n + Number(c) * (13 - i), 0);
    return base + String((11 - (sum % 11)) % 10);
  };
  const withSensitiveMember = async (first: string) => {
    const id = citizenId();
    lastCitizen = id;
    const created = await staff('post', '/api/members', { firstName: first, lastName: 'ส่งออก', birthDate: '1980-05-05', phoneMobile: '0811112222', citizenId: id, disabilityType: 'การเคลื่อนไหว', householdIncome: '12000', address: 'บ้านเลขที่ 1', memberType: 'disabled' });
    expect(created.status).toBe(201);
    return created.body.id as string;
  };

  it('leaves sensitive columns out of staff exports, and logs every export', async () => {
    await withSensitiveMember('ซ่อนคอลัมน์');
    const before = await exportsLogged('export.members');
    const out = await sheetOf(staff, '/api/reports/members.xlsx?q=ซ่อนคอลัมน์');
    for (const h of ['เลขบัตรประชาชน', 'ประเภทความพิการ', 'รายได้ครัวเรือน']) expect(out.headers).not.toContain(h);
    expect(out.headers).toEqual(expect.arrayContaining(['เลขสมาชิก', 'ชื่อ', 'ประเภทสมาชิกภาพ', 'วันหมดอายุสมาชิกภาพ', 'สถานะสมาชิกภาพ']));
    expect(JSON.stringify(out.rows.map((r) => r.values))).not.toContain(lastCitizen);
    expect(out.headers.indexOf('ชื่อ')).toBeLessThan(out.headers.indexOf('จังหวัด'));
    expect(await exportsLogged('export.members')).toBe(before + 1);
  });

  it('refuses a forged sensitive flag from staff and logs a real admin sensitive export once', async () => {
    await withSensitiveMember('ส่งออกลับ');
    const before = await exportsLogged('export.members.sensitive');
    const forged = await staff('get', '/api/reports/members.xlsx?sensitive=1&q=ส่งออกลับ');
    expect(forged.status).toBe(403);
    expect(await exportsLogged('export.members.sensitive')).toBe(before);
    const out = await sheetOf(admin, '/api/reports/members.xlsx?sensitive=1&q=ส่งออกลับ');
    expect(out.headers).toEqual(expect.arrayContaining(['เลขบัตรประชาชน', 'ประเภทความพิการ', 'รายได้ครัวเรือน']));
    expect(out.cell(out.rows[0]!, 'เลขบัตรประชาชน').value).toBe(lastCitizen);
    expect(await exportsLogged('export.members.sensitive')).toBe(before + 1);
    expect(await ctx.db.auditLog.count({ where: { organizationId: ctx.organizationId, action: 'export.members.sensitive', fields: { has: 'citizenId' } } })).toBe(0);
    expect((await staff('get', '/api/reports/members.xlsx?membership=nonsense')).status).toBe(422);
  });

  it('exports text that looks like a formula as plain text, and keeps long Thai text whole', async () => {
    const tricky = ['=SUM(1+1)', '+66812345678', '-1+1', '@cmd'];
    const long = 'ข้อความภาษาไทยที่ยาวมาก '.repeat(40).trim();
    for (const [i, name] of tricky.entries()) await staff('post', '/api/members', { firstName: name, lastName: 'สูตร', birthDate: `1990-01-0${i + 1}`, address: long });
    const out = await sheetOf(staff, '/api/reports/members.xlsx?q=สูตร');
    expect(out.rows).toHaveLength(4);
    for (const row of out.rows) {
      const c = out.cell(row, 'ชื่อ');
      expect(c.type).toBe(ExcelJS.ValueType.String);
      expect(tricky).toContain(c.value);
      expect(out.cell(row, 'ที่อยู่').value).toBe(long);
    }
  });

  it('exports registrations with each booking’s own snapshot, in columns keyed by question id', async () => {
    const { runId, sessionIds } = await makeRun(ctx, staff, { perSession: true, capacity: 5, closes: '2026-12-01T00:00:00.000Z' });
    const q = await staff('put', `/api/runs/${runId}/questions`, { questions: [
      { label: 'ชื่อเล่น', type: 'short_text', required: false, sensitive: false },
      { label: 'โรคประจำตัว', type: 'paragraph', required: false, sensitive: true },
      { label: 'อาหาร', type: 'single_choice', required: false, sensitive: false, options: [{ label: 'ไก่' }, { label: 'หมู' }] },
    ] });
    const [nick, health, food] = q.body.questions as Array<{ id: string; options: Array<{ id: string }> }>;
    const m = await paperMember(ctx, 'หลายวัน');
    await register(staff, runId, m.id, { sessionIds: [sessionIds[0]!], answers: { [nick!.id]: 'วันแรก', [health!.id]: 'ความดันสูง', [food!.id]: food!.options[0]!.id } });
    await register(staff, runId, m.id, { sessionIds: [sessionIds[1]!], answers: { [nick!.id]: '=ชื่อสูตร', [health!.id]: 'เบาหวาน', [food!.id]: food!.options[1]!.id } });
    await staff('post', `/api/sessions/${sessionIds[0]}/attendance`, { memberId: m.id, status: 'present' });
    const staffOut = await sheetOf(staff, `/api/reports/runs/${runId}.xlsx`);
    expect(staffOut.headers).not.toContain('โรคประจำตัว');
    expect(JSON.stringify(staffOut.rows.map((r) => r.values))).not.toMatch(/ความดันสูง|เบาหวาน/);
    expect(staffOut.rows).toHaveLength(2);
    const [r1, r2] = staffOut.rows as [ExcelJS.Row, ExcelJS.Row];
    expect(staffOut.cell(r1, 'ชื่อเล่น').value).toBe('วันแรก');
    expect(staffOut.cell(r1, 'อาหาร').value).toBe('ไก่');
    expect(staffOut.cell(r2, 'ชื่อเล่น').value).toBe('=ชื่อสูตร');
    expect(staffOut.cell(r2, 'ชื่อเล่น').type).toBe(ExcelJS.ValueType.String);
    expect(staffOut.cell(r2, 'อาหาร').value).toBe('หมู');
    expect([staffOut.cell(r1, 'ครั้งที่ส่งข้อมูล').value, staffOut.cell(r2, 'ครั้งที่ส่งข้อมูล').value]).toEqual([1, 2]);
    expect([staffOut.cell(r1, 'การเข้าร่วม').value, staffOut.cell(r2, 'การเข้าร่วม').value]).toEqual(['มา', 'ยังไม่เช็คชื่อ']);
    const adminOut = await sheetOf(admin, `/api/reports/runs/${runId}.xlsx?sensitive=1`);
    expect(adminOut.headers).toEqual(expect.arrayContaining(['โรคประจำตัว', 'เลขบัตรประชาชน']));
    expect([adminOut.cell(adminOut.rows[0]!, 'โรคประจำตัว').value, adminOut.cell(adminOut.rows[1]!, 'โรคประจำตัว').value]).toEqual(['ความดันสูง', 'เบาหวาน']);
    expect((await staff('get', `/api/reports/runs/${runId}.xlsx?sensitive=1`)).status).toBe(403);
    expect(await exportsLogged('export.run.sensitive')).toBe(1);
  });

  it('exports one row per member in whole-run mode with queue position and status words', async () => {
    const { runId } = await makeRun(ctx, staff, { capacity: 1, closes: '2026-12-01T00:00:00.000Z' });
    const [a, b, c] = [await paperMember(ctx, 'แถวหนึ่ง'), await paperMember(ctx, 'แถวสอง'), await paperMember(ctx, 'แถวสาม')];
    for (const m of [a, b, c]) await register(staff, runId, m.id);
    const out = await sheetOf(staff, `/api/reports/runs/${runId}.xlsx`);
    expect(out.rows.map((r) => [out.cell(r, 'สถานะการลงทะเบียน').value, out.cell(r, 'คิวที่').value])).toEqual([['ยืนยันแล้ว', ''], ['คิวรอ', 1], ['คิวรอ', 2]]);
    expect(out.headers).not.toContain('วันเรียน');
    expect((await staff('get', '/api/reports/runs/00000000-0000-4000-8000-000000000000.xlsx')).status).toBe(404);
    void key;
  });

  it('filters member exports like the member list and includes membership columns', async () => {
    const tier = (await admin('post', '/api/membership-tiers', { name: 'สมาชิกรายปี', fee: '300', durationMonths: 12 })).body.id;
    const m = await paperMember(ctx, 'สมาชิกส่งออก');
    await staff('post', `/api/members/${m.id}/memberships`, { tierId: tier, startsAt: '2026-01-01', expiresAt: '2026-11-01', amountPaid: '300', paidAt: '2026-01-01', paymentMethod: 'transfer' });
    const out = await sheetOf(staff, '/api/reports/members.xlsx?membership=expiring30&q=สมาชิกส่งออก');
    expect(out.rows).toHaveLength(1);
    expect(out.cell(out.rows[0]!, 'ประเภทสมาชิกภาพ').value).toBe('สมาชิกรายปี');
    expect(out.cell(out.rows[0]!, 'สถานะสมาชิกภาพ').value).toBe('ใช้งานอยู่');
    expect(out.cell(out.rows[0]!, 'วันหมดอายุสมาชิกภาพ').value).toBe('2026-11-01');
    expect((await sheetOf(staff, '/api/reports/members.xlsx?membership=expired&q=สมาชิกส่งออก')).rows).toHaveLength(0);
  });
});
