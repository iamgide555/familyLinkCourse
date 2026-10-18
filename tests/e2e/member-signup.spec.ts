import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fillSignup, lineContext, signIn, staffApi, tinyPng, unique, goStaff } from './helpers';

test('caregiver joins, then adds a patient who shares the phone number', async ({ browser }) => {
  const id = unique();
  const { page, context } = await lineContext(browser, `cg-${id}`);
  await page.goto('/member/signup');
  await expect(page.getByRole('heading', { name: 'สมัครสมาชิก FamilyLink' })).toBeVisible();
  await fillSignup(page, { first: `ผู้ดูแล${id}`, last: 'ทดสอบ', birth: '1980-01-02', phone: '0811112222' });
  await page.getByRole('button', { name: 'ส่งใบสมัคร' }).click();
  await expect(page.getByRole('heading', { name: 'สมัครสมาชิกเรียบร้อย' })).toBeVisible();
  await page.getByRole('link', { name: 'ไปที่โปรไฟล์' }).click();
  await expect(page.getByRole('heading', { name: `ผู้ดูแล${id} ทดสอบ` })).toBeVisible();
  await expect(page.getByText('ยังไม่ได้ลงนาม')).toBeVisible();

  await page.getByRole('link', { name: 'เพิ่มสมาชิก' }).click();
  await expect(page.getByRole('heading', { name: 'เพิ่มสมาชิกในครอบครัว' })).toBeVisible();
  await expect(page.getByLabel('สมัครให้บุคคลในครอบครัวที่ดูแลอยู่')).toBeChecked();
  await fillSignup(page, { first: `ผู้ป่วย${id}`, last: 'ทดสอบ', birth: '2001-05-06', phone: '0811112222', type: 'คนพิการ', relationship: 'บุตร', filler: `ผู้ดูแล${id} ทดสอบ` });
  await page.getByRole('button', { name: 'ส่งใบสมัคร' }).click();
  await expect(page.getByRole('heading', { name: 'สมัครสมาชิกเรียบร้อย' })).toBeVisible();
  await page.getByRole('link', { name: 'ไปที่โปรไฟล์' }).click();
  const switcher = page.getByRole('radiogroup', { name: 'เลือกสมาชิก' });
  await expect(switcher.getByRole('radio')).toHaveCount(2);
  await switcher.getByRole('radio', { name: `ผู้ป่วย${id}` }).click();
  await expect(page.getByRole('heading', { name: `ผู้ป่วย${id} ทดสอบ` })).toBeVisible();
  await expect(page.getByText('คนพิการ')).toBeVisible();
  await context.close();
});

test('a matched signup waits for staff and never reveals the existing record', async ({ browser, request }) => {
  const id = unique();
  const api = await staffApi(request);
  const existing = await api.post('/members', { firstName: `เดิม${id}`, lastName: 'ซ้ำชื่อ', birthDate: '1975-03-04', phoneMobile: '0899990001' });
  const { page, context } = await lineContext(browser, `match-${id}`);
  const meResponses: string[] = [];
  page.on('response', async (response) => { if (response.url().includes('/api/member/me')) meResponses.push(await response.text().catch(() => '')); });
  await page.goto('/member/signup');
  await fillSignup(page, { first: `นายเดิม${id}`, last: 'ซ้ำชื่อ', birth: '1975-03-04', phone: '0811110000' });
  await page.getByRole('button', { name: 'ส่งใบสมัคร' }).click();
  await expect(page.getByRole('heading', { name: 'ส่งข้อมูลแล้ว รอเจ้าหน้าที่ยืนยัน' })).toBeVisible();
  await page.goto('/member/profile');
  await expect(page.getByRole('heading', { name: 'ส่งข้อมูลแล้ว รอเจ้าหน้าที่ยืนยัน' })).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain(existing.memberNumber);
  expect(html).not.toContain('0899990001');
  expect(meResponses.join('')).not.toContain(existing.id);
  expect((await page.request.get(`/api/member/me/${existing.id}`, { headers: { 'x-dev-line-user-id': `synthetic-match-${id}` } })).status()).toBe(404);

  // Staff confirm the link; the member then appears for that LINE account.
  const staff = await context.browser()!.newPage();
  await signIn(staff);
  await staff.getByRole('link', { name: /รอตรวจสอบ/ }).click();
  const card = staff.getByRole('article', { name: `ใบสมัครของ นายเดิม${id} ซ้ำชื่อ` });
  await expect(card.getByText(existing.memberNumber)).toBeVisible();
  await card.getByRole('button', { name: 'เชื่อมกับสมาชิกคนนี้' }).click();
  await expect(staff.getByRole('status').filter({ hasText: 'ตรวจสอบใบสมัครของ' })).toBeVisible();
  await page.goto('/member/profile');
  await expect(page.getByRole('heading', { name: `เดิม${id} ซ้ำชื่อ` })).toBeVisible();
  await staff.close();
  await context.close();
});

test('a browser invite ends at signup and gives no profile access', async ({ browser, page }) => {
  const id = unique();
  await signIn(page);
  await goStaff(page, 'สร้างลิงก์สมัคร');
  await page.getByLabel('ชื่อ', { exact: true }).fill(`เชิญ${id}`);
  await page.getByRole('button', { name: 'สร้างลิงก์' }).click();
  const url = await page.getByLabel('ลิงก์สมัครสมาชิก').inputValue();
  await expect(page.getByRole('img', { name: 'รหัส QR ของลิงก์สมัครสมาชิก' })).toBeVisible();
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(new URL(url).pathname + new URL(url).search);
  await expect(guest.getByLabel('ชื่อ', { exact: true })).toHaveValue(`เชิญ${id}`);
  await fillSignup(guest, { first: `เชิญ${id}`, last: 'ผ่านลิงก์', birth: '1990-07-08' });
  await guest.getByRole('button', { name: 'ส่งใบสมัคร' }).click();
  await expect(guest.getByRole('heading', { name: 'สมัครสมาชิกเรียบร้อย' })).toBeVisible();
  await expect(guest.getByText('ลิงก์นี้ใช้สมัครสมาชิกเท่านั้น')).toBeVisible();
  await expect(guest.getByRole('link', { name: 'ไปที่โปรไฟล์' })).toHaveCount(0);
  expect((await guest.request.get('/api/member/me')).status()).toBe(401);
  // The same link cannot be reused.
  await guest.goto(new URL(url).pathname + new URL(url).search);
  await expect(guest.getByRole('alert')).toContainText('ลิงก์หมดอายุหรือถูกใช้แล้ว');
  await context.close();
});

test('the sensitive-data consent appears only when attaching, and no file is sent before agreeing', async ({ browser }) => {
  const id = unique();
  const { page, context } = await lineContext(browser, `upl-${id}`);
  const calls: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/member/documents')) calls.push(`${r.method()} ${new URL(r.url()).pathname.replace(/[0-9a-f-]{36}/, ':id')}`); });
  await page.goto('/member/signup');
  await expect(page.getByText(/ข้อมูลอ่อนไหวในเอกสารที่แนบ/)).toHaveCount(0);
  await page.getByRole('button', { name: 'ต้องการแนบเอกสาร' }).click();
  const consent = page.getByLabel(/ข้าพเจ้ายินยอมให้สมาคม FamilyLink เก็บและใช้ข้อมูลอ่อนไหว/);
  await expect(consent).not.toBeChecked();
  await expect(page.getByLabel(/เลือกไฟล์/)).toHaveCount(0);
  expect(calls).toEqual([]);
  await consent.check();
  await page.getByLabel(/เลือกไฟล์/).setInputFiles({ name: 'id.png', mimeType: 'image/png', buffer: tinyPng });
  await expect(page.getByText(/แนบแล้ว: รูปภาพ/)).toBeVisible();
  expect(calls).toEqual(['POST /api/member/documents/drafts', 'POST /api/member/documents/drafts/:id/consent', 'POST /api/member/documents/drafts/:id/files']);
  await fillSignup(page, { first: `แนบ${id}`, last: 'ไฟล์', birth: '1988-08-08' });
  await page.getByRole('button', { name: 'ส่งใบสมัคร' }).click();
  await expect(page.getByRole('heading', { name: 'สมัครสมาชิกเรียบร้อย' })).toBeVisible();
  await context.close();
});

test('the signup form is usable at phone width and passes automated accessibility checks', async ({ browser }) => {
  const { page, context } = await lineContext(browser, `a11y-${unique()}`);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/member/signup');
  await expect(page.getByRole('heading', { name: 'สมัครสมาชิก FamilyLink' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  await page.getByRole('button', { name: 'ส่งใบสมัคร' }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('ชื่อ', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await context.close();
});
