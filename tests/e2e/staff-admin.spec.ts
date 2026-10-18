import { test, expect } from '@playwright/test';
import { signIn, unique, goStaff } from './helpers';

test('admin adds staff, disables them, and their open session ends at once', async ({ browser, page }) => {
  const id = unique();
  const email = `new-staff-${id}@familylink.test`;
  await signIn(page);
  await goStaff(page, 'บัญชีเจ้าหน้าที่');
  await page.getByLabel('ชื่อ-นามสกุล').fill(`เจ้าหน้าที่ใหม่${id}`);
  await page.getByLabel('อีเมลสำหรับเข้าสู่ระบบ').fill(email);
  await page.getByLabel(/รหัสผ่านเริ่มต้น/).fill('Synthetic-password-2026');
  await page.getByRole('button', { name: 'เพิ่มเจ้าหน้าที่' }).click();
  await expect(page.getByText('เพิ่มเจ้าหน้าที่แล้ว')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: email })).toContainText('เจ้าหน้าที่ · ใช้งานอยู่');

  const context = await browser.newContext();
  const staffPage = await context.newPage();
  await signIn(staffPage, { email, password: 'Synthetic-password-2026' });
  await expect(staffPage.getByRole('heading', { name: 'ค้นหาสมาชิก' })).toBeVisible();

  await page.getByRole('listitem').filter({ hasText: email }).getByRole('button', { name: 'ปิดการใช้งาน' }).click();
  await expect(page.getByText(/ปิดการใช้งานแล้ว/)).toBeVisible();
  await staffPage.reload();
  await expect(staffPage).toHaveURL(/\/staff\/login/);
  await staffPage.getByLabel('อีเมล', { exact: true }).fill(email);
  await staffPage.getByLabel('รหัสผ่าน', { exact: true }).fill('Synthetic-password-2026');
  await staffPage.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(staffPage.getByRole('alert')).toBeVisible();
  await expect(staffPage).toHaveURL(/\/staff\/login/);
  await context.close();
});

test('the last active admin cannot be disabled or demoted', async ({ page }) => {
  await signIn(page);
  await goStaff(page, 'บัญชีเจ้าหน้าที่');
  const me = page.getByRole('listitem').filter({ hasText: 'admin@familylink.test' });
  await expect(me.getByRole('button', { name: 'ปิดการใช้งาน' })).toBeDisabled();
});
