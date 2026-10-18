import { withIdentity, validCitizenId } from './helpers.js';
import request from 'supertest';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import { createTestApp, type TestApp } from './test-app.js';
import { Members } from '../src/members/members.service.js';

// Catches missing persistence, unsafe duplicate overrides, tenant leaks and plaintext sensitive intake.
describe('staff paper intake and member search', () => {
  let ctx: TestApp;
  let cookie: string[];
  let csrf: string;
  const input = {
    firstName: 'สมชาย',
    lastName: 'ตัวอย่าง',
    birthDate: '1970-03-02',
    phoneMobile: '0812345678',
  };
  const send = (path: string, body: object, method: 'post' | 'patch' = 'post') =>
    request(ctx.app.getHttpServer())
      [method](path)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send(path === '/api/members' && method === 'post' ? withIdentity(body) : body);
  const get = (path: string) => request(ctx.app.getHttpServer()).get(path).set('Cookie', cookie);
  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.db.user.create({
      data: {
        organizationId: ctx.organizationId,
        email: 'intake@example.test',
        name: 'เจ้าหน้าที่ทดสอบ',
        role: 'staff',
        passwordHash: await hash('Synthetic-password-2026'),
      },
    });
    const session = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'intake@example.test', password: 'Synthetic-password-2026' });
    cookie = ([] as string[]).concat(session.headers['set-cookie']);
    csrf = session.body.csrfToken;
  });
  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  it('saves a paper member with the other details left empty and survives a profile reload', async () => {
    const result = await send('/api/members', { firstName: 'ข้อมูลไม่ครบ', lastName: 'ทดสอบ' });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      firstName: 'ข้อมูลไม่ครบ',
      source: 'paper',
      completeness: 'incomplete',
      signedFormAt: null,
    });
    expect(result.body.citizenId).toMatch(/^\d{13}$/);
    expect(result.body.memberNumber).toMatch(/^FL\d{6,}$/);
    const profile = await get(`/api/members/${result.body.id}`);
    expect(profile.status).toBe(200);
    expect(profile.body.memberNumber).toBe(result.body.memberNumber);
  });
  it('requires an ID number, or a stated reason why there is none, for every new member', async () => {
    const base = { firstName: 'ไม่มีเลขบัตร', lastName: 'ทดสอบ' };
    const missing = await send('/api/members', { ...base, noCitizenId: false });
    expect(missing.status).toBe(422);
    expect(Object.keys(missing.body.fields)).toEqual(['citizenId']);
    const noReason = await send('/api/members', { ...base, noCitizenId: true });
    expect(noReason.status).toBe(422);
    expect(Object.keys(noReason.body.fields)).toEqual(['citizenIdMissingReason']);
    const badCheckDigit = await send('/api/members', { ...base, citizenId: '1234567890123' });
    expect(badCheckDigit.status).toBe(422);
    expect(badCheckDigit.body.fields.citizenId).toContain('ไม่ถูกต้อง');
    const waived = await send('/api/members', { ...base, noCitizenId: true, citizenIdMissingReason: 'เด็กอายุต่ำกว่า 7 ปี ยังไม่มีบัตร' });
    expect(waived.status).toBe(201);
    expect(waived.body).toMatchObject({ citizenId: '', citizenIdMissingReason: 'เด็กอายุต่ำกว่า 7 ปี ยังไม่มีบัตร' });
    const reload = await get(`/api/members/${waived.body.id}`);
    expect(reload.body.citizenIdMissingReason).toBe('เด็กอายุต่ำกว่า 7 ปี ยังไม่มีบัตร');
    // The reason is free text, so it is encrypted at rest like other intake details.
    const row = await ctx.db.member.findUniqueOrThrow({ where: { organizationId_id: { organizationId: ctx.organizationId, id: waived.body.id } } });
    expect(JSON.stringify(row.intakeEncrypted)).not.toContain('เด็กอายุต่ำกว่า');
    // Giving a number later replaces the reason.
    const fixed = await send(`/api/members/${waived.body.id}`, { ...base, citizenId: validCitizenId(), expectedVersion: waived.body.version }, 'patch');
    expect(fixed.status).toBe(200);
    expect(fixed.body.citizenIdMissingReason).toBe('');
  });
  it('requires a birth date for every new member, because name and birth date are how people are told apart', async () => {
    const base = { firstName: 'ไม่มีวันเกิด', lastName: 'ทดสอบ', citizenId: validCitizenId() };
    const missing = await send('/api/members', { ...base, birthDate: '' });
    expect(missing.status).toBe(422);
    expect(Object.keys(missing.body.fields)).toEqual(['birthDate']);
    const ok = await send('/api/members', { ...base, birthDate: '1987-06-05' });
    expect(ok.status).toBe(201);
    // An older record without a birth date can still be edited; one that has a date cannot lose it.
    const legacy = await ctx.db.member.create({ data: { organizationId: ctx.organizationId, firstName: 'เก่าไม่มีวันเกิด', lastName: 'ทดสอบ', normalizedFirstName: 'เก่าไม่มีวันเกิด', normalizedLastName: 'ทดสอบ', source: 'paper', memberNumber: 'FL990002' } });
    expect((await send(`/api/members/${legacy.id}`, { firstName: 'เก่าไม่มีวันเกิด', lastName: 'ทดสอบ', phoneMobile: '0812223334', expectedVersion: legacy.version }, 'patch')).status).toBe(200);
    const cleared = await send(`/api/members/${ok.body.id}`, { firstName: 'ไม่มีวันเกิด', lastName: 'ทดสอบ', birthDate: '', expectedVersion: ok.body.version }, 'patch');
    expect(cleared.status).toBe(422);
    expect(Object.keys(cleared.body.fields)).toEqual(['birthDate']);
  });
  it('lets an older record that never had an ID be edited, but not lose an ID it has', async () => {
    const legacy = await ctx.db.member.create({ data: { organizationId: ctx.organizationId, firstName: 'ข้อมูลเก่า', lastName: 'ทดสอบ', normalizedFirstName: 'ข้อมูลเก่า', normalizedLastName: 'ทดสอบ', birthDate: '1960-02-02', source: 'paper', memberNumber: 'FL990001' } });
    const edited = await send(`/api/members/${legacy.id}`, { firstName: 'ข้อมูลเก่า', lastName: 'ทดสอบ', phoneMobile: '0812223333', expectedVersion: legacy.version }, 'patch');
    expect(edited.status).toBe(200);
    const withId = await send('/api/members', { firstName: 'มีเลขแล้ว', lastName: 'ทดสอบ', noCitizenId: false, citizenId: validCitizenId() });
    expect(withId.status).toBe(201);
    const cleared = await send(`/api/members/${withId.body.id}`, { firstName: 'มีเลขแล้ว', lastName: 'ทดสอบ', citizenId: '', expectedVersion: withId.body.version }, 'patch');
    expect(cleared.status).toBe(422);
    expect(Object.keys(cleared.body.fields)).toEqual(['citizenId']);
  });
  it('same normalized name and birth date requires explicit staff choice and a recorded reason', async () => {
    const saved = await send('/api/members', input);
    expect(saved.status).toBe(201);
    const duplicate = await send('/api/members', {
      ...input,
      firstName: ' นาย สมชาย ',
      phoneMobile: '0899999999',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('MEMBER_REVIEW_REQUIRED');
    const matches = await send('/api/members/matches', { ...input, firstName: 'นายสมชาย' });
    expect(matches.status).toBe(200);
    expect(matches.body.map((m: { id: string }) => m.id)).toContain(saved.body.id);
    const noReason = await send('/api/members', { ...input, duplicateDecision: 'create_new' });
    expect(noReason.status).toBe(422);
    const override = await send('/api/members', {
      ...input,
      duplicateDecision: 'create_new',
      duplicateReason: 'คนละคน ตรวจสอบเอกสารแล้ว',
    });
    expect(override.status).toBe(201);
    expect(override.body.id).not.toBe(saved.body.id);
    const audit = await ctx.db.auditLog.findMany({
      where: { organizationId: ctx.organizationId, entityId: override.body.id },
    });
    expect(audit.some((event) => event.action === 'member.duplicate_override')).toBe(true);
    expect(JSON.stringify(audit)).not.toContain('คนละคน ตรวจสอบเอกสารแล้ว');
  });
  it('shared phone alone creates a separate patient under the explicitly chosen caregiver', async () => {
    const caregiver = await send('/api/members', {
      ...input,
      firstName: 'ผู้ดูแล',
      lastName: 'สมมติ',
    });
    expect(caregiver.status).toBe(201);
    const patient = await send('/api/members', {
      ...input,
      firstName: 'ผู้รับการดูแล',
      lastName: 'สมมติ',
      birthDate: '1995-04-04',
      memberType: 'disabled',
      caregiverMemberId: caregiver.body.id,
      caregiverRelationship: 'มารดา',
    });
    expect(patient.status).toBe(201);
    expect(patient.body.caregiverMemberId).toBe(caregiver.body.id);
    expect(patient.body.lineAccountId).toBeUndefined();
  });
  it('citizen ID conflicts cannot be overridden, including concurrent inserts', async () => {
    const attempts = await Promise.all(
      ['หนึ่ง', 'สอง'].map((firstName) =>
        send('/api/members', {
          ...input,
          firstName,
          lastName: 'เลขซ้ำ',
          citizenId: '1101700207030',
          duplicateDecision: 'create_new',
          duplicateReason: 'ยืนยันคนละคน',
        }),
      ),
    );
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(attempts.find((r) => r.status === 409)!.body.code).toBe('CITIZEN_ID_EXISTS');
  });
  it('unchanged own citizen ID is accepted on edits; edits still check another matching person', async () => {
    const saved = await send('/api/members', {
      ...input,
      firstName: 'แก้ไข',
      lastName: 'ทดสอบ',
      citizenId: '1234567890121',
    });
    expect(saved.status).toBe(201);
    const edited = await send(
      `/api/members/${saved.body.id}`,
      {
        ...input,
        firstName: 'แก้ไข',
        lastName: 'ทดสอบ',
        citizenId: '1234567890121',
        email: 'updated@example.test',
        expectedVersion: saved.body.version,
      },
      'patch',
    );
    expect(edited.status).toBe(200);
    expect(edited.body.email).toBe('updated@example.test');
    const conflict = await send(`/api/members/${saved.body.id}`, { ...input, expectedVersion: edited.body.version }, 'patch');
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('MEMBER_REVIEW_REQUIRED');
  });
  it.each([
    ['phoneMobile', '12345'],
    ['phoneMobile', '0712345678'],
    ['citizenId', '1234567890123'],
    ['birthDate', '2030-01-01'],
    ['birthDate', '1970-02-31'],
    ['email', 'invalid'],
  ])('rejects invalid %s: %s', async (field, value) => {
    const result = await send('/api/members', {
      firstName: 'ตรวจสอบ',
      lastName: 'ข้อมูล',
      [field]: value,
    });
    expect(result.status).toBe(422);
  });
  it('sensitive values are encrypted in PostgreSQL and absent from list/audit responses', async () => {
    const saved = await send('/api/members', {
      firstName: 'ข้อมูลลับ',
      lastName: 'ตัวอย่าง',
      citizenId: '3101700230747',
      memberType: 'disabled',
      disabilityType: 'ข้อความสุขภาพลับ',
      householdIncome: '23456',
      householdSize: 3,
    });
    expect(saved.status).toBe(201);
    const rows = await ctx.db.$queryRaw<
      Array<{ document: unknown }>
    >`SELECT to_jsonb(m) AS document FROM members m WHERE organization_id = ${ctx.organizationId} AND id = ${saved.body.id}`;
    const serialized = JSON.stringify(rows);
    for (const secret of ['3101700230747', 'ข้อความสุขภาพลับ', '23456'])
      expect(serialized).not.toContain(secret);
    const profile = await get(`/api/members/${saved.body.id}`);
    expect(profile.body.disabilityType).toBe('ข้อความสุขภาพลับ');
    const list = await get('/api/members?q=ข้อมูลลับ');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('ข้อความสุขภาพลับ');
    const logs = await ctx.db.auditLog.findMany({
      where: { organizationId: ctx.organizationId, entityId: saved.body.id },
    });
    expect(logs.some((l) => l.action === 'member.view')).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('ข้อความสุขภาพลับ');
  });
  it('searches names, normalized phone and member number with bounded pagination', async () => {
    const saved = await send('/api/members', {
      firstName: 'ค้นหาพิเศษ',
      lastName: 'นามสมมติ',
      phoneMobile: '08-7654-3210',
    });
    expect(saved.status).toBe(201);
    for (const query of ['ค้นหาพิเศษ นามสมมติ', '08-7654-3210', saved.body.memberNumber]) {
      const result = await get(`/api/members?q=${encodeURIComponent(query)}`);
      expect(result.status).toBe(200);
      expect(result.body.items.map((m: { id: string }) => m.id)).toContain(saved.body.id);
    }
    expect((await get('/api/members?page=0')).status).toBe(422);
    const result = await get('/api/members?page=1');
    expect(result.body.items.length).toBeLessThanOrEqual(20);
  });
  it('other organization member cannot be opened, changed or chosen as caregiver', async () => {
    const otherOrg = randomUUID();
    await ctx.db.organization.create({ data: { id: otherOrg, name: 'Other synthetic' } });
    try {
      const member = await ctx.db.member.create({
        data: { organizationId: otherOrg, firstName: 'Other', lastName: 'Synthetic' },
      });
      expect((await get(`/api/members/${member.id}`)).status).toBe(404);
      expect((await send(`/api/members/${member.id}`, { ...input, expectedVersion: 0 }, 'patch')).status).toBe(404);
      const create = await send('/api/members', {
        firstName: 'ผิดองค์กร',
        lastName: 'ทดสอบ',
        caregiverMemberId: member.id,
        caregiverRelationship: 'ญาติ',
      });
      expect(create.status).toBe(404);
    } finally {
      await ctx.db.organization.delete({ where: { id: otherOrg } });
    }
  });
  it('untrusted fields cannot assign LINE access or organization; unauthenticated requests fail', async () => {
    expect((await send('/api/members', { ...input, lineAccountId: 'forged' })).status).toBe(422);
    expect((await send('/api/members', { ...input, organizationId: 'forged' })).status).toBe(422);
    expect((await request(ctx.app.getHttpServer()).get('/api/members')).status).toBe(401);
  });
  it('email can be cleared and malformed null fields do not overwrite valid intake', async () => {
    const saved = await send('/api/members', {
      firstName: 'ล้างอีเมล',
      lastName: 'ทดสอบ',
      email: 'remove@example.test',
    });
    expect(saved.status).toBe(201);
    const cleared = await send(
      `/api/members/${saved.body.id}`,
      { firstName: 'ล้างอีเมล', lastName: 'ทดสอบ', email: '', expectedVersion: saved.body.version },
      'patch',
    );
    expect(cleared.status).toBe(200);
    expect(cleared.body.email).toBe('');
    const malformed = await send(
      `/api/members/${saved.body.id}`,
      { firstName: 'ล้างอีเมล', lastName: 'ทดสอบ', disabilityType: null, expectedVersion: cleared.body.version },
      'patch',
    );
    expect(malformed.status).toBe(422);
  });
  it('rejects structured search parameters instead of crashing', async () => {
    expect((await get('/api/members?q[bad]=value')).status).toBe(422);
  });
  it('audit metadata records the actual changed field names without their contents', async () => {
    const saved = await send('/api/members', { firstName: 'บันทึกเหตุการณ์', lastName: 'ทดสอบ' });
    expect(saved.status).toBe(201);
    const edited = await send(
      `/api/members/${saved.body.id}`,
      { firstName: 'บันทึกเหตุการณ์', lastName: 'ทดสอบ', phoneMobile: '0898765432', expectedVersion: saved.body.version },
      'patch',
    );
    expect(edited.status).toBe(200);
    const event = await ctx.db.auditLog.findFirstOrThrow({
      where: {
        organizationId: ctx.organizationId,
        entityId: saved.body.id,
        action: 'member.update',
      },
    });
    expect(event.fields).toEqual(['phoneMobile']);
    expect(JSON.stringify(event)).not.toContain('0898765432');
  });

  it('partial edits preserve previously saved sensitive intake and contact fields', async () => {
    const saved = await send('/api/members', {
      firstName: 'รักษาข้อมูล',
      lastName: 'ทดสอบ',
      disabilityType: 'ข้อมูลที่ต้องคงอยู่',
      email: 'keep@example.test',
      caregiverName: 'ผู้ดูแลสมมติ',
    });
    expect(saved.status).toBe(201);
    const edited = await send(
      `/api/members/${saved.body.id}`,
      { firstName: 'รักษาข้อมูล', lastName: 'ทดสอบ', phoneMobile: '0898765432', expectedVersion: saved.body.version },
      'patch',
    );
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      disabilityType: 'ข้อมูลที่ต้องคงอยู่',
      email: 'keep@example.test',
      caregiverName: 'ผู้ดูแลสมมติ',
    });
  });
  it('rejects a stale full-form edit and keeps the newer values', async () => {
    const saved = await send('/api/members', { firstName: 'รุ่นข้อมูล', lastName: 'ทดสอบ' });
    const first = await send(`/api/members/${saved.body.id}`, {
      firstName: 'รุ่นข้อมูล', lastName: 'ทดสอบ', email: 'new@example.test', expectedVersion: saved.body.version,
    }, 'patch');
    expect(first.status).toBe(200);
    const stale = await send(`/api/members/${saved.body.id}`, {
      firstName: 'รุ่นข้อมูล', lastName: 'ทดสอบ', email: 'old@example.test', expectedVersion: saved.body.version,
    }, 'patch');
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('MEMBER_EDIT_CONFLICT');
    expect((await get(`/api/members/${saved.body.id}`)).body.email).toBe('new@example.test');
  });
  it('allows searching a legacy member by its displayed ID prefix', async () => {
    const legacy = await ctx.db.member.create({ data: { organizationId: ctx.organizationId, firstName: 'เก่า', lastName: 'ค้นหา' } });
    const result = await get(`/api/members?q=${legacy.id.slice(0, 8)}`);
    expect(result.body.items.map((m: {id: string}) => m.id)).toContain(legacy.id);
  });
  it('enforces address hierarchy and auto-derived postcode on staff intake', async () => {
    const result = await send('/api/members', {
      firstName: 'ที่อยู่', lastName: 'ทดสอบ', provinceId: 'นนทบุรี', districtId: 'เมืองนนทบุรี',
      subdistrictId: 'บางกระสอ', postcode: '11000',
    });
    expect(result.status).toBe(201);
    expect(result.body.postcode).toBe('11000');
    const bad = await send('/api/members', {
      firstName: 'ที่อยู่ผิด', lastName: 'ทดสอบ', provinceId: 'นนทบุรี', districtId: 'เมืองนนทบุรี',
      subdistrictId: 'บางกระสอ', postcode: '99999',
    });
    expect(bad.status).toBe(422);
    expect(bad.body.fields.postcode).toBeTruthy();
  });
  it('returns only linked participant fields from the internal projection service', async () => {
    const saved = await send('/api/members', {
      firstName: 'สิทธิ', lastName: 'ผู้เข้าร่วม',
      disabilityType: 'ข้อมูลลับ', householdIncome: '5000',
    });
    await ctx.db.member.update({ where: { id: saved.body.id }, data: { lineAccountId: 'line-test-owner' } });
    const members = ctx.app.get(Members);
    const view = await members.getParticipantView({ kind: 'member', organizationId: ctx.organizationId, lineAccountId: 'line-test-owner' }, saved.body.id);
    expect(Object.keys(view).sort()).toEqual(['birthDate','completeness','districtId','email','firstName','id','lastName','memberType','membership','phoneMobile','provinceId','requestedServiceIds','signedFormAt'].sort());
    expect(JSON.stringify(view)).not.toContain('ข้อมูลลับ');
    await expect(members.getParticipantView({ kind: 'member', organizationId: ctx.organizationId, lineAccountId: 'other-owner' }, saved.body.id)).rejects.toMatchObject({ status: 404 });
  });
  it('can create paper intake inside an outer transaction that rolls back atomically', async () => {
    const actor = await ctx.db.user.findFirstOrThrow({ where: { organizationId: ctx.organizationId, email: 'intake@example.test' } });
    const members = ctx.app.get(Members);
    await expect(ctx.db.$transaction(async (tx) => {
      await members.createPaper(tx, { kind: 'staff', organizationId: ctx.organizationId, userId: actor.id, role: 'staff', memberId: null }, { firstName: 'ย้อนธุรกรรม', lastName: 'ทดสอบ', citizenId: validCitizenId(), birthDate: '1980-01-01' });
      throw new Error('ROLLBACK_TEST');
    })).rejects.toThrow('ROLLBACK_TEST');
    expect(await ctx.db.member.count({ where: { organizationId: ctx.organizationId, firstName: 'ย้อนธุรกรรม' } })).toBe(0);
  });
});
