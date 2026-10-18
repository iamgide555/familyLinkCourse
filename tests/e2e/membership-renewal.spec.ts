import { test, expect } from '@playwright/test';
import { bangkokToday, signIn, staffApi, unique, goStaff, openMore } from './helpers';

test('admin sets up a tier; staff record upgrade, expiry, renewal; admin voids; filters follow', async ({ page, request }) => {
  const id = unique();
  const tierName = `สามัญ${id}`;
  await signIn(page);
  await goStaff(page, 'ตั้งค่าระบบ');
  await page.getByRole('link', { name: /ประเภทสมาชิกและค่าสมาชิก/ }).click();
  await page.getByLabel('ชื่อประเภท').fill(tierName);
  await page.getByLabel('ค่าสมาชิก (บาท)').fill('500');
  await page.getByLabel(/ระยะเวลา \(เดือน\)/).fill('12');
  await page.getByRole('button', { name: 'เพิ่มประเภท' }).click();
  await expect(page.getByText(`${tierName} · 500.00 บาท · 12 เดือน`)).toBeVisible();

  const api = await staffApi(request);
  const member = await api.post('/members', { firstName: `สมาชิกจ่าย${id}`, lastName: 'ทดสอบ' });
  await page.goto(`/staff/members/${member.id}`);
  await expect(page.getByText('สถานะ: สมาชิกทั่วไป')).toBeVisible();
  await page.getByLabel('ประเภทสมาชิก', { exact: true }).selectOption({ label: `${tierName} (500.00 บาท)` });
  await expect(page.getByLabel('จำนวนเงินที่รับ (บาท)')).toHaveValue('500.00');
  await page.getByLabel('เริ่มเป็นสมาชิกตั้งแต่').fill('2025-01-01');
  await expect(page.getByLabel('หมดอายุวันที่', { exact: true })).toHaveValue('2025-12-31');
  await page.getByLabel('วันที่ชำระเงิน').fill('2025-01-02');
  await page.getByLabel('เลขที่ใบเสร็จ (ไม่บังคับ)').fill(`R-${id}`);
  await page.getByRole('button', { name: 'บันทึกการชำระเงิน' }).click();
  await expect(page.getByText('บันทึกการชำระเงินแล้ว')).toBeVisible();
  await expect(page.getByText('สถานะ: หมดอายุ')).toBeVisible();
  await expect(page.getByText(`ประเภท: ${tierName}`)).toBeVisible();
  await expect(page.getByText(/หมดอายุแล้วยังเก็บประเภทที่เคยชำระไว้/)).toBeVisible();

  await page.getByLabel('ประเภทสมาชิก', { exact: true }).selectOption({ label: `${tierName} (500.00 บาท)` });
  await page.getByLabel('เริ่มเป็นสมาชิกตั้งแต่').fill(bangkokToday(0));
  await page.getByLabel('วันที่ชำระเงิน').fill(bangkokToday(0));
  await page.getByRole('button', { name: 'บันทึกการชำระเงิน' }).click();
  await expect(page.getByText('สถานะ: ใช้งานอยู่')).toBeVisible();
  await expect(page.getByRole('list', { name: 'ประวัติการชำระเงิน' }).getByRole('listitem')).toHaveCount(2);

  await page.goto('/staff');
  await page.getByText('กรองตามสมาชิกภาพ').click();
  await page.getByLabel('ประเภทสมาชิก', { exact: true }).selectOption({ label: tierName });
  await page.getByLabel('สถานะ', { exact: true }).selectOption({ label: 'หมดอายุแล้ว' });
  await expect(page.getByText('ไม่พบสมาชิกตามคำค้นหา')).toBeVisible();
  await page.getByLabel('สถานะ', { exact: true }).selectOption({ label: 'ใช้งานอยู่ (รวมตลอดชีพ)' });
  await expect(page.getByRole('link', { name: `เปิดข้อมูล สมาชิกจ่าย${id} ทดสอบ` })).toBeVisible();

  await page.goto(`/staff/members/${member.id}`);
  await page.getByRole('listitem').filter({ hasText: 'ชำระ' }).first().getByRole('button', { name: 'ยกเลิกรายการ' }).click();
  await page.getByLabel('เหตุผล', { exact: true }).fill('บันทึกผิดคน');
  await page.getByRole('button', { name: 'ยืนยันยกเลิกรายการ' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ยกเลิกรายการแล้ว' })).toBeVisible();
  await expect(page.getByText('สถานะ: หมดอายุ')).toBeVisible();
  await expect(page.getByRole('list', { name: 'ประวัติการชำระเงิน' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('list', { name: 'ประวัติการชำระเงิน' })).toContainText('ยกเลิกรายการแล้ว');
});

test('staff cannot see admin-only membership controls', async ({ page, request, browser }) => {
  const id = unique();
  const api = await staffApi(request);
  const email = `member-staff-${id}@familylink.test`;
  await api.post('/staff', { email, name: `เจ้าหน้าที่${id}`, password: 'Synthetic-password-2026', role: 'staff' });
  const member = await api.post('/members', { firstName: `สิทธิ์${id}`, lastName: 'ทดสอบ' });
  void page;
  const context = await browser.newContext();
  const staffPage = await context.newPage();
  await signIn(staffPage, { email, password: 'Synthetic-password-2026' });
  await openMore(staffPage);
  await expect(staffPage.getByRole('link', { name: 'ตั้งค่าระบบ' })).toHaveCount(0);
  await expect(staffPage.getByRole('link', { name: 'บัญชีเจ้าหน้าที่' })).toHaveCount(0);
  await staffPage.goto(`/staff/members/${member.id}`);
  await expect(staffPage.getByRole('heading', { name: 'สมาชิกภาพและการชำระเงิน' })).toBeVisible();
  await expect(staffPage.getByRole('button', { name: 'ยกเลิกรายการ' })).toHaveCount(0);
  expect((await staffPage.request.get('/api/staff')).status()).toBe(403);
  expect((await staffPage.request.patch('/api/settings/organization', { data: { pdf: { title: 'x' } } })).status()).toBe(403);
  await context.close();
});
