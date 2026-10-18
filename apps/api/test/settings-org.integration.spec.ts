import { createTestApp, type TestApp } from './test-app.js';
import { http, joinLine, login, serviceType, staffCaller } from './helpers.js';

describe('organization settings', () => {
  let ctx: TestApp;
  let admin: ReturnType<typeof staffCaller>;
  let staff: ReturnType<typeof staffCaller>;
  beforeAll(async () => {
    ctx = await createTestApp();
    admin = staffCaller(ctx, await login(ctx, 'set-admin@example.test', 'admin'));
    staff = staffCaller(ctx, await login(ctx, 'set-staff@example.test', 'staff'));
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('lets staff read but not change organization settings', async () => {
    const read = await staff('get', '/api/settings/organization');
    expect(read.status).toBe(200);
    expect(read.body.consents.privacy.text).toContain('ประกาศความเป็นส่วนตัว');
    expect(read.body.messages['registration.confirmed']).toContain('{{member}}');
    expect((await staff('patch', '/api/settings/organization', { pdf: { title: 'x' } })).status).toBe(403);
  });

  it('versions consent wording and keeps earlier consent records on the version signed', async () => {
    const svc = await serviceType(ctx);
    const before = (await http(ctx).get('/api/member/signup/options')).body;
    const memberId = await joinLine(ctx, 'set-old', 'ยินยอมเก่า', 'ทดสอบ', '1980-01-01', svc, { privacyConsent: { version: before.consentVersions.privacy, consentedBy: 'self', granted: true } });
    const updated = await admin('patch', '/api/settings/organization', { consents: { privacy: { text: 'ข้อความยินยอมฉบับใหม่ที่ทนายตรวจแล้ว' } } });
    expect(updated.status).toBe(200);
    expect(updated.body.consents.privacy.version).not.toBe(before.consentVersions.privacy);
    const after = (await http(ctx).get('/api/member/signup/options')).body;
    expect(after.consentTexts.privacy.text).toBe('ข้อความยินยอมฉบับใหม่ที่ทนายตรวจแล้ว');
    expect(after.consentVersions.privacy).toBe(updated.body.consents.privacy.version);
    const rows = await ctx.db.consent.findMany({ where: { organizationId: ctx.organizationId, memberId, purpose: 'privacy' } });
    expect(rows.map((r) => r.version)).toEqual([before.consentVersions.privacy]);
    expect((await admin('patch', '/api/settings/organization', { consents: { privacy: { text: 'ข้อความยินยอมฉบับใหม่ที่ทนายตรวจแล้ว' } } })).status).toBe(422);
    const logs = await ctx.db.auditLog.findMany({ where: { organizationId: ctx.organizationId, action: 'organization_settings.update' } });
    expect(JSON.stringify(logs)).not.toContain('ทนายตรวจ');
  });

  it('accepts safe message templates and rejects links, markup and unknown placeholders', async () => {
    const ok = await admin('patch', '/api/settings/organization', { messages: { 'session.reminder': 'พรุ่งนี้มีเรียน {{course}} {{sessions}} อย่าลืมมานะคะ' } });
    expect(ok.body.messages['session.reminder']).toBe('พรุ่งนี้มีเรียน {{course}} {{sessions}} อย่าลืมมานะคะ');
    for (const bad of ['ดูที่ https://evil.example', 'ลิงก์ www.evil.example', '<script>alert(1)</script>', 'ข้อมูล {{citizenId}} ของคุณ', 'เปิด {{course', '', 'ก'.repeat(401), 'javascript:alert(1)']) {
      const r = await admin('patch', '/api/settings/organization', { messages: { 'session.reminder': bad } });
      expect([bad.slice(0, 20), r.status]).toEqual([bad.slice(0, 20), 422]);
    }
    expect((await admin('patch', '/api/settings/organization', { messages: { 'not.a.kind': 'x' } })).status).toBe(422);
    expect((await staff('get', '/api/settings/organization')).body.messages['session.reminder']).toContain('อย่าลืมมานะคะ');
  });

  it('bounds retention values and PDF text, and ignores unknown settings', async () => {
    expect((await admin('patch', '/api/settings/organization', { retention: { generalDays: 5 } })).status).toBe(422);
    expect((await admin('patch', '/api/settings/organization', { retention: { generalDays: 'forever' } })).status).toBe(422);
    const ok = await admin('patch', '/api/settings/organization', { retention: { sensitiveDays: 1825, idCopyDays: null } });
    expect(ok.body.retention).toEqual({ generalDays: null, sensitiveDays: 1825, idCopyDays: null });
    expect((await admin('patch', '/api/settings/organization', { pdf: { title: '<b>x</b>' } })).status).toBe(422);
    expect((await admin('patch', '/api/settings/organization', { pdf: { title: '' } })).status).toBe(422);
    expect((await admin('patch', '/api/settings/organization', { pdf: { title: 'แบบคำขอสมาชิก', footer: 'สมาคม FamilyLink' } })).body.pdf).toEqual({ title: 'แบบคำขอสมาชิก', footer: 'สมาคม FamilyLink' });
    expect((await admin('patch', '/api/settings/organization', { secret: true })).status).toBe(422);
    expect((await admin('patch', '/api/settings/organization', {})).status).toBe(422);
  });
});
