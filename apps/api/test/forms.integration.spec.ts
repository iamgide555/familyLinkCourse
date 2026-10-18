import { withIdentity } from './helpers.js';
import request from 'supertest';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createTestApp, type TestApp } from './test-app.js';

describe('staff printable signup and physical signature receipt', () => {
  let ctx: TestApp;
  let cookie: string[];
  let csrf: string;
  const post = (path: string, body: object) =>
    request(ctx.app.getHttpServer())
      .post(path)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send(path === '/api/members' ? withIdentity(body) : body);
  const get = (path: string) => request(ctx.app.getHttpServer()).get(path).set('Cookie', cookie);
  const addMember = async (body: object) => {
    const response = await post('/api/members', body);
    expect(response.status).toBe(201);
    return response.body as { id: string; signedFormAt: string | null };
  };
  const pdfBytes = (response: request.Response) =>
    Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.text ?? '', 'binary');
  const captureQa = async (name: string, buffer: Buffer) => {
    if (process.env['FORM_PDF_QA_DIR'])
      await writeFile(path.join(process.env['FORM_PDF_QA_DIR'], name), buffer);
  };
  // Chromium's PDF text layer splits Thai shaping runs between glyphs.
  const readable = (text: string) => text.replace(/[\s\u0000]/g, '');
  const pdfText = async (buffer: Buffer) => {
    const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
    const document = await task.promise;
    try {
      const pages = await Promise.all(
        Array.from({ length: document.numPages }, async (_, index) => {
          const page = await document.getPage(index + 1);
          const content = await page.getTextContent();
          return {
            width: page.view[2],
            height: page.view[3],
            items: content.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number } => 'str' in item),
            text: content.items.map((item) => ('str' in item ? item.str : '')).join(' '),
          };
        }),
      );
      return { text: pages.map((page) => page.text).join('\n'), pages };
    } finally {
      await task.destroy();
    }
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.db.user.create({
      data: {
        organizationId: ctx.organizationId,
        email: 'forms@example.test',
        name: 'เจ้าหน้าที่เอกสาร',
        role: 'staff',
        passwordHash: await hash('Synthetic-password-2026'),
      },
    });
    const session = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'forms@example.test', password: 'Synthetic-password-2026' });
    cookie = ([] as string[]).concat(session.headers['set-cookie']);
    csrf = session.body.csrfToken;
  });
  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  it('form has intake fields, blank missing values and blank Part 3', async () => {
    const member = await addMember({
      firstName: 'สมใจ',
      lastName: 'ตัวอย่าง',
      birthDate: '1980-02-03',
      phoneMobile: '0812345678',
      address: 'ถนนตัวอย่าง เขตทดสอบ',
      emergencyName: 'ผู้ติดต่อฉุกเฉิน',
    });
    const note = await post(`/api/members/${member.id}/case-notes`, { body: 'CONFIDENTIAL_NOTE_SENTINEL_8291' });
    expect(note.status).toBe(201);
    const result = await post('/api/forms/signup', { memberIds: [member.id] }).buffer(true);
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toMatch(/^application\/pdf/);
    expect(pdfBytes(result).subarray(0, 5).toString()).toBe('%PDF-');
    await captureQa('normal.pdf', pdfBytes(result));
    const { text: extracted } = await pdfText(pdfBytes(result));
    const text = readable(extracted);
    for (const field of ['สมใจ', 'ตัวอย่าง', '0812345678', 'ถนนตัวอย่าง', 'ผู้ติดต่อฉุกเฉิน'])
      expect(text).toContain(field);
    expect(text).toContain('ส่วนที3');
    expect(text).toContain('ลายมือชือ');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
    expect(text).not.toContain('CONFIDENTIAL_NOTE_SENTINEL_8291');
    const pdf = await pdfText(pdfBytes(result));
    for (const page of pdf.pages)
      for (const item of page.items.filter((value) => value.str))
        expect(item.transform[5]).toBeGreaterThanOrEqual(40);
    expect(pdf.pages[0]!.items.filter((item) => item.str === '\u0000' && item.width > 0 && item.transform[5] < 100)).toHaveLength(0);
  });

  it('printing never marks a paper signature received and every print is audited', async () => {
    const member = await addMember({ firstName: 'พิมพ์', lastName: 'ยังไม่ลงนาม' });
    const result = await post('/api/forms/signup', { memberIds: [member.id] }).buffer(true);
    expect(result.status).toBe(200);
    const profile = await get(`/api/members/${member.id}`);
    expect(profile.body.signedFormAt).toBeNull();
    const audit = await ctx.db.auditLog.findMany({ where: { organizationId: ctx.organizationId, entityId: member.id } });
    expect(audit.some((event) => event.action === 'form.print')).toBe(true);
  });

  it('prefills Part 2 with the member requested service names', async () => {
    const selected = await ctx.db.serviceType.create({ data: { organizationId: ctx.organizationId, name: 'บริการให้คำปรึกษา' } });
    await ctx.db.serviceType.create({ data: { organizationId: ctx.organizationId, name: 'บริการกายภาพบำบัด' } });
    const member = await addMember({ firstName: 'เลือก', lastName: 'บริการ', requestedServiceIds: [selected.id] });
    const result = await post('/api/forms/signup', { memberIds: [member.id] }).buffer(true);
    expect(result.status).toBe(200);
    const { text } = await pdfText(pdfBytes(result));
    expect(readable(text)).toContain('บริการให้คําปรึกษา');
    expect(readable(text)).not.toContain('บริการกายภาพบําบัด');
  });

  it('explicit receipt saves the observed date, audits it and survives profile reload', async () => {
    const member = await addMember({ firstName: 'รับ', lastName: 'เอกสาร' });
    const receivedAt = '2026-10-16T09:30:00.000Z';
    const receipt = await post(`/api/members/${member.id}/signature-receipt`, { receivedAt });
    expect(receipt.status).toBe(200);
    const profile = await get(`/api/members/${member.id}`);
    expect(profile.body.signedFormAt).toBe(receivedAt);
    const audit = await ctx.db.auditLog.findMany({ where: { organizationId: ctx.organizationId, entityId: member.id } });
    expect(audit.some((event) => event.action === 'form.signature_received' && event.fields.includes('signedFormAt'))).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(receivedAt);
  });

  it('rejects future or malformed receipt dates', async () => {
    const member = await addMember({ firstName: 'วันที่', lastName: 'ผิด' });
    for (const receivedAt of ['tomorrow', '2026-02-30T00:00:00.000Z', '2030-01-01T00:00:00.000Z']) {
      const result = await post(`/api/members/${member.id}/signature-receipt`, { receivedAt });
      expect(result.status).toBe(422);
    }
    expect((await get(`/api/members/${member.id}`)).body.signedFormAt).toBeNull();
  });

  it('does not reveal or sign another organization member', async () => {
    const otherOrganizationId = randomUUID();
    await ctx.db.organization.create({ data: { id: otherOrganizationId, name: 'Other synthetic organization' } });
    try {
      const other = await ctx.db.member.create({ data: { organizationId: otherOrganizationId, firstName: 'ข้าม', lastName: 'องค์กร' } });
      expect((await post('/api/forms/signup', { memberIds: [other.id] })).status).toBe(404);
      expect((await post(`/api/members/${other.id}/signature-receipt`, { receivedAt: '2026-10-16T09:30:00.000Z' })).status).toBe(404);
      expect((await ctx.db.member.findUnique({ where: { id: other.id } }))?.signedFormAt).toBeNull();
    } finally {
      await ctx.db.organization.delete({ where: { id: otherOrganizationId } });
    }
  });

  it('keeps long Thai values and signature labels inside page boundaries', async () => {
    const member = await addMember({
      firstName: 'กาญจนาภิเษก'.repeat(9),
      lastName: 'ศรีสวัสดิ์'.repeat(10),
      address: 'หมู่บ้านทดสอบ ถนนสุขสวัสดิ์ เขตบางกอก '.repeat(35),
    });
    const result = await post('/api/forms/signup', { memberIds: [member.id] }).buffer(true);
    expect(result.status).toBe(200);
    const pdf = await pdfText(pdfBytes(result));
    await captureQa('long.pdf', pdfBytes(result));
    expect(readable(pdf.text)).toContain('กาญจนาภิเษก');
    expect(readable(pdf.text)).toContain('เขตบางกอก');
    expect(readable(pdf.text)).toContain('ลายมือชือ');
    for (const page of pdf.pages) {
      for (const item of page.items.filter((value) => value.str.trim())) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(20);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(page.width - 15);
        expect(item.transform[5]).toBeGreaterThanOrEqual(18);
        expect(item.transform[5]).toBeLessThanOrEqual(page.height - 15);
      }
    }
  });

  it('loads its template and fonts when the API starts from its workspace directory', async () => {
    const member = await addMember({ firstName: 'ทดสอบ', lastName: 'ตำแหน่งไฟล์' });
    const original = process.cwd();
    try {
      process.chdir(path.join(original, 'apps/api'));
      const result = await post('/api/forms/signup', { memberIds: [member.id] }).buffer(true);
      expect(result.status).toBe(200);
      expect(pdfBytes(result).subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      process.chdir(original);
    }
  });
});
