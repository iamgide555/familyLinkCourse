import { validCitizenId } from './helpers.js';
import request from 'supertest';
import { hash } from 'argon2';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createTestApp, type TestApp } from './test-app.js';
import { FileStore } from '../src/documents/file-store.js';
import { Documents } from '../src/documents/documents.service.js';
import type { EncryptedValue } from '../src/crypto/field-crypto.js';

type Session = { cookie: string[]; csrf: string };
const LINE = { 'x-dev-line-user-id': 'synthetic-docs-line1' };
const consent = { version: 'v1', consentedBy: 'self', granted: true };

describe('document uploads, consent and permissions', () => {
  let ctx: TestApp;
  let staff: Session;
  let admin: Session;
  let serviceTypeId: string;
  let documentTypeId: string;
  let nonSensitiveTypeId: string;
  const http = () => request(ctx.app.getHttpServer());
  const login = async (email: string, role: 'admin' | 'staff'): Promise<Session> => {
    await ctx.db.user.create({ data: { organizationId: ctx.organizationId, email, name: email, role, passwordHash: await hash('Synthetic-password-2026') } });
    const response = await http().post('/api/auth/login').send({ email, password: 'Synthetic-password-2026' });
    return { cookie: ([] as string[]).concat(response.headers['set-cookie']), csrf: response.body.csrfToken };
  };
  const as = (session: Session, method: 'get' | 'post' | 'delete', path: string) => {
    const r = http()[method](path).set('Cookie', session.cookie);
    return method === 'get' ? r : r.set('X-CSRF-Token', session.csrf);
  };
  const jpeg = (size = 600) => sharp({ create: { width: size, height: size - 100, channels: 3, background: '#808080' } })
    .withExif({ IFD0: { Copyright: 'secret-owner' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '13/1 45/1 0/1' } }).jpeg().toBuffer();
  const pdf = async (pages = 1) => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i += 1) doc.addPage([300, 400]).drawText(`page ${i + 1}`, { x: 20, y: 300, size: 18 });
    return Buffer.from(await doc.save());
  };
  const newDraft = async (token?: string) => {
    const response = await http().post('/api/member/documents/drafts').set(token ? {} : LINE).send(token ? { inviteToken: token } : {});
    expect(response.status).toBe(201);
    return response.body as { draftId: string; draftToken: string };
  };
  const upload = (draft: { draftId: string; draftToken: string }, bytes: Buffer, typeId?: string, token?: string) =>
    http().post(`/api/member/documents/drafts/${draft.draftId}/files`).set(token ? { 'x-invite-token': token } : LINE)
      .set('x-draft-token', draft.draftToken).set('x-document-type-id', typeId ?? documentTypeId).set('Content-Type', 'application/octet-stream').send(bytes);
  const grant = (draft: { draftId: string; draftToken: string }, token?: string) =>
    http().post(`/api/member/documents/drafts/${draft.draftId}/consent`).set(token ? {} : LINE)
      .send({ draftToken: draft.draftToken, ...(token ? { inviteToken: token } : {}), consent });
  const stored = async (documentId: string) => {
    const row = await ctx.db.memberDocument.findUniqueOrThrow({ where: { id: documentId } });
    return ctx.app.get(FileStore).get(row.fileKeyEncrypted as EncryptedValue);
  };
  const makeMember = (name = 'เอกสาร') => ctx.db.member.create({ data: { organizationId: ctx.organizationId, firstName: name, lastName: 'ทดสอบ', normalizedFirstName: name, normalizedLastName: 'ทดสอบ', birthDate: '1990-01-01' } });

  beforeAll(async () => {
    ctx = await createTestApp();
    serviceTypeId = (await ctx.db.serviceType.create({ data: { organizationId: ctx.organizationId, name: 'Synthetic service' } })).id;
    documentTypeId = (await ctx.db.documentType.create({ data: { organizationId: ctx.organizationId, name: 'บัตรประชาชน' } })).id;
    nonSensitiveTypeId = (await ctx.db.documentType.create({ data: { organizationId: ctx.organizationId, name: 'ใบรับรองทั่วไป', sensitive: false } })).id;
    staff = await login('docs-staff@example.test', 'staff');
    admin = await login('docs-admin@example.test', 'admin');
  });
  afterAll(async () => { if (ctx) await ctx.close(); });

  it('every document type requires explicit upload consent before bytes are accepted', async () => {
    const draft = await newDraft();
    for (const typeId of [documentTypeId, nonSensitiveTypeId]) {
      const refused = await upload(draft, await jpeg(), typeId);
      expect(refused.status).toBe(422);
      expect(refused.body.code).toBe('UPLOAD_CONSENT_REQUIRED');
    }
    const declined = await http().post(`/api/member/documents/drafts/${draft.draftId}/consent`).set(LINE).send({ draftToken: draft.draftToken, consent: { ...consent, granted: false } });
    expect(declined.status).toBe(422);
    expect((await upload(draft, await jpeg())).status).toBe(422);
    expect((await grant(draft)).status).toBe(201);
    for (const typeId of [documentTypeId, nonSensitiveTypeId]) expect((await upload(draft, await jpeg(), typeId)).status).toBe(201);
    expect(await ctx.db.memberDocument.count({ where: { organizationId: ctx.organizationId, draftId: draft.draftId } })).toBe(2);
  });

  it('refuses another account or a forged draft token', async () => {
    const draft = await newDraft();
    await grant(draft);
    const other = await http().post(`/api/member/documents/drafts/${draft.draftId}/files`).set({ 'x-dev-line-user-id': 'synthetic-docs-other' })
      .set('x-draft-token', draft.draftToken).set('Content-Type', 'application/octet-stream').send(await jpeg());
    expect(other.status).toBe(403);
    const forged = await upload({ ...draft, draftToken: 'forged' }, await jpeg());
    expect(forged.status).toBe(403);
    expect((await http().post('/api/member/documents/drafts').send({})).status).toBe(401);
  });

  it('judges the real file type by content, not name or client headers', async () => {
    const draft = await newDraft();
    await grant(draft);
    const png = await sharp({ create: { width: 200, height: 120, channels: 3, background: '#aa4444' } }).png().toBuffer();
    const result = await http().post(`/api/member/documents/drafts/${draft.draftId}/files`).set(LINE)
      .set('x-draft-token', draft.draftToken).set('Content-Type', 'application/pdf').set('x-file-name', 'looks-like.pdf').send(png);
    expect(result.status).toBe(201);
    expect(result.body.mime).toBe('image/png');
    for (const bytes of [Buffer.from('MZ\u0090\u0000 executable'), Buffer.from('plain text file'), Buffer.from('%PDF-1.4 truncated nonsense')]) {
      const rejected = await upload(draft, bytes);
      expect([415, 422]).toContain(rejected.status);
    }
    expect((await upload(draft, Buffer.alloc(0))).status).toBe(422);
  });

  it('accepts exactly 10,000,000 bytes and rejects one more', async () => {
    const draft = await newDraft();
    await grant(draft);
    const base = await jpeg(300);
    const exact = Buffer.concat([base, Buffer.alloc(10_000_000 - base.length)]);
    expect(exact.length).toBe(10_000_000);
    expect((await upload(draft, exact)).status).toBe(201);
    const over = Buffer.concat([base, Buffer.alloc(10_000_001 - base.length)]);
    expect((await upload(draft, over)).status).toBe(413);
  });

  it('re-encodes images without EXIF or GPS, applies the watermark and stores only encrypted bytes', async () => {
    const draft = await newDraft();
    await grant(draft);
    const original = await jpeg();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const receipt = await upload(draft, original);
    expect(receipt.status).toBe(201);
    expect(receipt.body).not.toHaveProperty('fileKey');
    expect(JSON.stringify(receipt.body)).not.toContain('.enc');
    const clean = await stored(receipt.body.id);
    const meta = await sharp(clean).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe('jpeg');
    expect((await sharp(clean).stats()).channels[0]!.stdev).toBeGreaterThan(2);
    expect((await sharp(original).stats()).channels[0]!.stdev).toBeLessThan(1);
  });

  it('keeps no readable file contents on disk', async () => {
    const draft = await newDraft();
    await grant(draft);
    const receipt = await upload(draft, await jpeg());
    const row = await ctx.db.memberDocument.findUniqueOrThrow({ where: { id: receipt.body.id } });
    const onDisk = await readFile(ctx.app.get(FileStore).locate(row.fileKeyEncrypted as EncryptedValue));
    expect(onDisk.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
    expect(onDisk.includes(Buffer.from('JFIF'))).toBe(false);
    expect(JSON.stringify(row.fileKeyEncrypted)).not.toContain('.enc');
  });

  it('converts HEIC photos to JPEG', async () => {
    const draft = await newDraft();
    await grant(draft);
    const heic = await readFile(join(process.cwd(), 'apps/api/test/fixtures/sample.heic'));
    const receipt = await upload(draft, heic);
    expect(receipt.status).toBe(201);
    expect(receipt.body.mime).toBe('image/jpeg');
    expect((await sharp(await stored(receipt.body.id)).metadata()).format).toBe('jpeg');
  });

  it('watermarks every PDF page, removes risky objects and rejects unreadable PDFs', async () => {
    const draft = await newDraft();
    await grant(draft);
    const receipt = await upload(draft, await pdf(3));
    expect(receipt.status).toBe(201);
    expect(receipt.body.mime).toBe('application/pdf');
    const bytes = await stored(receipt.body.id);
    const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    const document = await task.promise;
    expect(document.numPages).toBe(3);
    for (let n = 1; n <= 3; n += 1) {
      const text = (await (await document.getPage(n)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join('').replace(/\s/g, '');
      expect(text).toContain('FamilyLink');
      expect(text).toContain('สมาคม');
    }
    await task.destroy();
    expect((await upload(draft, Buffer.from('%PDF-1.7\n1 0 obj << /Broken')) ).status).toBe(422);
    expect((await upload(draft, await pdf(31))).status).toBe(422);
  });

  it('staff can submit and see a receipt but never read the stored copy', async () => {
    const member = await makeMember();
    const bytes = await jpeg();
    const attempt = await as(staff, 'post', `/api/members/${member.id}/documents`).set('x-document-type-id', documentTypeId).set('Content-Type', 'application/octet-stream').send(bytes);
    expect(attempt.status).toBe(422);
    const accepted = await as(staff, 'post', `/api/members/${member.id}/documents`).set('x-paper-consent', 'confirmed').set('x-document-type-id', documentTypeId).set('Content-Type', 'application/octet-stream').send(bytes);
    expect(accepted.status).toBe(201);
    const listed = await as(staff, 'get', `/api/members/${member.id}/documents`);
    expect(listed.body.items).toEqual([expect.objectContaining({ id: accepted.body.id, status: 'received', mime: 'image/jpeg' })]);
    expect((await as(staff, 'get', `/api/documents/${accepted.body.id}/content`)).status).toBe(403);
    expect((await as(staff, 'post', `/api/documents/${accepted.body.id}/verify`)).status).toBe(403);
    expect((await as(staff, 'delete', `/api/documents/${accepted.body.id}`)).status).toBe(403);
    const download = await as(admin, 'get', `/api/documents/${accepted.body.id}/content`).buffer(true);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('image/jpeg');
    expect((await sharp(download.body as Buffer).metadata()).format).toBe('jpeg');
    const logs = await ctx.db.auditLog.findMany({ where: { organizationId: ctx.organizationId, entityId: accepted.body.id } });
    expect(logs.map((x) => x.action)).toEqual(expect.arrayContaining(['document.upload', 'document.view']));
    const verified = await as(admin, 'post', `/api/documents/${accepted.body.id}/verify`);
    expect(verified.body.status).toBe('verified');
    expect((await as(admin, 'delete', `/api/documents/${accepted.body.id}`)).status).toBe(200);
    expect((await as(admin, 'get', `/api/documents/${accepted.body.id}/content`)).status).toBe(404);
  });

  it('allows only admins to upload signed-form scans', async () => {
    const member = await makeMember('ลงนาม');
    const send = (session: Session) => as(session, 'post', `/api/members/${member.id}/documents`).set('x-document-kind', 'signed_form').set('x-paper-consent', 'confirmed').set('Content-Type', 'application/octet-stream');
    expect((await send(staff).send(await jpeg())).status).toBe(403);
    const adminUpload = await send(admin).send(await jpeg());
    expect(adminUpload.status).toBe(201);
    expect(adminUpload.body.kind).toBe('signed_form');
  });

  it('moves staged files to the new member on signup and removes expired drafts', async () => {
    const invite = await as(staff, 'post', '/api/member/invites').send({ mode: 'signup' });
    const token = invite.body.token as string;
    const draft = await newDraft(token);
    expect((await upload(draft, await jpeg(), undefined, token)).status).toBe(422);
    await grant(draft, token);
    const receipt = await upload(draft, await jpeg(), undefined, token);
    expect(receipt.status).toBe(201);
    const signup = await http().post('/api/member/signup').send({
      citizenId: validCitizenId(), inviteToken: token, draftId: draft.draftId, draftToken: draft.draftToken, firstName: 'แนบไฟล์', lastName: 'ทดสอบ',
      birthDate: '1991-03-04', phoneMobile: '0812345678', memberType: 'caregiver', provinceId: 'กระบี่', districtId: 'เกาะลันตา',
      requestedServiceIds: [serviceTypeId], registeringFor: 'self', privacyConsent: consent,
    });
    expect(signup.status).toBe(201);
    const row = await ctx.db.memberDocument.findUniqueOrThrow({ where: { id: receipt.body.id } });
    expect(row.memberId).toBe(signup.body.memberId);
    expect(row.draftId).toBeNull();
    const recorded = await ctx.db.consent.findMany({ where: { organizationId: ctx.organizationId, memberId: signup.body.memberId } });
    expect(recorded.map((c) => c.purpose)).toEqual(expect.arrayContaining(['privacy', 'sensitive_upload']));

    const abandoned = await newDraft();
    await grant(abandoned);
    const orphan = await upload(abandoned, await jpeg());
    ctx.clock.advance(25 * 60 * 60 * 1000);
    const removed = await ctx.app.get(Documents).cleanupExpiredDrafts(ctx.clock.now());
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await ctx.db.memberDocument.findUnique({ where: { id: orphan.body.id } })).toBeNull();
    expect(await ctx.db.memberDocument.findUnique({ where: { id: receipt.body.id } })).not.toBeNull();
    ctx.clock.set('2026-10-17T03:00:00.000Z');
  });

  it('a signup without attachments never needs the sensitive-data consent', async () => {
    const invite = await as(staff, 'post', '/api/member/invites').send({ mode: 'signup' });
    const signup = await http().post('/api/member/signup').send({
      citizenId: validCitizenId(), inviteToken: invite.body.token, firstName: 'ไม่แนบ', lastName: 'ไฟล์', birthDate: '1993-03-04', phoneMobile: '0812345679',
      memberType: 'disabled', provinceId: 'กระบี่', districtId: 'เกาะลันตา', requestedServiceIds: [serviceTypeId], registeringFor: 'self', privacyConsent: consent,
    });
    expect(signup.status).toBe(201);
    const recorded = await ctx.db.consent.findMany({ where: { organizationId: ctx.organizationId, memberId: signup.body.memberId } });
    expect(recorded.map((c) => c.purpose)).not.toContain('sensitive_upload');
  });
});
