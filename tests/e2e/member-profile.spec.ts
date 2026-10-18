import { test, expect } from '@playwright/test';
import { citizenId, lineContext, signIn, staffApi, tinyPng, unique, goStaff } from './helpers';

async function joined(browser: import('@playwright/test').Browser, id: string, first: string) {
  const line = await lineContext(browser, id);
  const response = await line.page.request.post('/api/member/signup', {
    headers: { 'x-dev-line-user-id': line.id },
    data: {
      firstName: first, lastName: 'โปรไฟล์', birthDate: '1983-03-03', phoneMobile: '0811110000', memberType: 'caregiver', provinceId: 'กระบี่',
      districtId: 'เกาะลันตา', requestedServiceIds: [(await (await line.page.request.get('/api/member/signup/options')).json()).services[0].id],
      registeringFor: 'self', privacyConsent: { version: 'v1', consentedBy: 'self', granted: true },
    },
  });
  expect(response.status()).toBe(201);
  return { ...line, memberId: (await response.json()).memberId as string };
}

test('a correction request changes the profile only after staff approve it', async ({ browser, page }) => {
  const id = unique();
  const member = await joined(browser, `prof-${id}`, `แก้ไข${id}`);
  await member.page.goto('/member/profile');
  await expect(member.page.getByRole('heading', { name: `แก้ไข${id} โปรไฟล์` })).toBeVisible();
  await expect(member.page.getByText('0811110000')).toBeVisible();
  await member.page.getByRole('button', { name: 'ขอแก้ไขข้อมูล' }).click();
  await member.page.getByLabel('เบอร์มือถือ', { exact: true }).fill('0899998888');
  await member.page.getByRole('button', { name: 'ส่งคำขอแก้ไข' }).click();
  await expect(member.page.getByText('ส่งคำขอแก้ไขแล้ว รอเจ้าหน้าที่อนุมัติ')).toBeVisible();
  await member.page.reload();
  await expect(member.page.getByText('0811110000')).toBeVisible();
  await expect(member.page.getByText(/รอเจ้าหน้าที่อนุมัติ/)).toBeVisible();
  await expect(member.page.getByRole('button', { name: 'ขอแก้ไขข้อมูล' })).toHaveCount(0);

  await signIn(page);
  await page.getByRole('link', { name: /รอตรวจสอบ/ }).click();
  const card = page.getByRole('article', { name: `คำขอแก้ไขของ แก้ไข${id} โปรไฟล์` });
  await expect(card.getByRole('cell', { name: '0811110000' })).toBeVisible();
  await expect(card.getByRole('cell', { name: '0899998888' })).toBeVisible();
  await card.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'อนุมัติการแก้ไขของ' })).toBeVisible();

  await member.page.reload();
  await expect(member.page.getByText('0899998888')).toBeVisible();
  await expect(member.page.getByText('0811110000')).toHaveCount(0);
  await member.context.close();
});

test('hidden intake fields are never shown to the member or accepted in a request', async ({ browser, request }) => {
  const id = unique();
  const member = await joined(browser, `hid-${id}`, `ซ่อน${id}`);
  const api = await staffApi(request);
  const secretId = citizenId();
  const record = await api.get(`/members/${member.memberId}`);
  await api.patch(`/members/${member.memberId}`, { firstName: record.firstName, lastName: record.lastName, expectedVersion: record.version, birthDate: record.birthDate, citizenId: secretId, disabilityType: 'ข้อมูลลับสำหรับเจ้าหน้าที่', householdIncome: '99999' });
  await member.page.goto('/member/profile');
  await expect(member.page.getByRole('heading', { name: `ซ่อน${id} โปรไฟล์` })).toBeVisible();
  const html = await member.page.content();
  for (const secret of [secretId, 'ข้อมูลลับสำหรับเจ้าหน้าที่', '99999']) expect(html).not.toContain(secret);
  const body = JSON.stringify(await (await member.page.request.get('/api/member/me', { headers: { 'x-dev-line-user-id': member.id } })).json());
  for (const secret of [secretId, 'ข้อมูลลับสำหรับเจ้าหน้าที่', '99999', 'citizenId', 'householdIncome']) expect(body).not.toContain(secret);
  const forged = await member.page.request.post(`/api/member/me/${member.memberId}/profile-changes`, { headers: { 'x-dev-line-user-id': member.id }, data: { citizenId: secretId } });
  expect(forged.status()).toBe(422);
  await member.context.close();
});

test('a staff-issued QR links a paper member to a LINE account exactly once', async ({ browser, page }) => {
  const id = unique();
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByLabel('ชื่อ', { exact: true }).fill(`คิวอาร์${id}`);
  await page.getByLabel('นามสกุล', { exact: true }).fill('กระดาษ');
  await page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true }).click();
  await expect(page.getByRole('heading', { name: `คิวอาร์${id} กระดาษ` })).toBeVisible();
  // The QR appears by itself right after a new paper member is saved.
  await expect(page.getByRole('img', { name: /รหัส QR เชื่อมต่อ LINE/ })).toBeVisible();
  const url = await page.getByLabel('ลิงก์สำหรับส่งทางแชท LINE หรือ SMS').inputValue();
  const path = new URL(url).pathname + new URL(url).search;

  const first = await lineContext(browser, `qr1-${id}`);
  await first.page.goto(path);
  await expect(first.page.getByText('เชื่อมต่อเรียบร้อยแล้ว')).toBeVisible();
  await first.page.getByRole('link', { name: 'ไปที่โปรไฟล์' }).click();
  await expect(first.page.getByRole('heading', { name: `คิวอาร์${id} กระดาษ` })).toBeVisible();

  const second = await lineContext(browser, `qr2-${id}`);
  await second.page.goto(path);
  await expect(second.page.getByRole('alert')).toContainText('ลิงก์หมดอายุหรือถูกใช้แล้ว');

  await page.reload();
  await expect(page.getByText('เชื่อมต่อ LINE แล้ว', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'ยกเลิกการเชื่อมต่อ LINE' }).click();
  await page.getByLabel(/เหตุผลที่ยกเลิกการเชื่อมต่อ/).fill('ผู้ดูแลเปลี่ยนคน');
  await page.getByRole('button', { name: 'ยืนยันยกเลิกการเชื่อมต่อ' }).click();
  await expect(page.getByRole('button', { name: 'สร้างรหัส QR เชื่อมต่อ LINE' })).toBeVisible();
  await first.page.goto('/member/profile');
  await expect(first.page.getByText('บัญชี LINE นี้ยังไม่มีสมาชิก')).toBeVisible();
  await first.context.close();
  await second.context.close();
});

test('staff receive a document, admins alone can open it, and nothing links directly to the file', async ({ page }) => {
  const id = unique();
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByLabel('ชื่อ', { exact: true }).fill(`เอกสาร${id}`);
  await page.getByLabel('นามสกุล', { exact: true }).fill('แนบไฟล์');
  await page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true }).click();
  await expect(page.getByRole('heading', { name: `เอกสาร${id} แนบไฟล์` })).toBeVisible();
  await page.getByLabel(/เลือกไฟล์/).setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: tinyPng });
  await expect(page.getByRole('button', { name: 'ส่งไฟล์เข้าระบบ' })).toBeDisabled();
  await page.getByLabel(/ยืนยันว่าสมาชิกให้ความยินยอม/).check();
  await page.getByRole('button', { name: 'ส่งไฟล์เข้าระบบ' }).click();
  await expect(page.getByText('ส่งไฟล์เข้าระบบแล้ว')).toBeVisible();
  await expect(page.getByText('ได้รับไฟล์แล้ว')).toBeVisible();
  const links = await page.locator('a[href*="documents"], a[href*=".enc"], img[src*="documents"]').count();
  expect(links).toBe(0);
  await page.getByRole('button', { name: 'ตรวจสอบแล้ว' }).click();
  await expect(page.getByText('ผู้ดูแลระบบตรวจสอบแล้ว')).toBeVisible();
});
