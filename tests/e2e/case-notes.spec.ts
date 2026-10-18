import { goStaff } from './helpers';
import { test, expect } from '@playwright/test';

test('staff profile preserves note history and lets the author correct and delete a note', async ({
  page,
}) => {
  await page.goto('/staff/login');
  await page.getByLabel('อีเมล', { exact: true }).fill('admin@familylink.test');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('Synthetic-password-2026');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByLabel('ชื่อ', { exact: true }).fill(`บันทึก${Date.now()}`);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'บันทึกเคส' })).toBeVisible();

  await page.getByLabel('บันทึกเคสใหม่').fill('ข้อความเริ่มต้น');
  await page.getByRole('button', { name: 'เพิ่มบันทึกเคส' }).click();
  await expect(page.getByText('ข้อความเริ่มต้น', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'แก้ไขบันทึก', exact: true }).click();
  await page.getByLabel('แก้ไขข้อความบันทึก').fill('ข้อความที่แก้ไข');
  await page.getByRole('button', { name: 'บันทึกการแก้ไขบันทึก' }).click();
  await expect(page.getByText('ข้อความที่แก้ไข', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ดูประวัติบันทึก' }).click();
  await expect(page.getByText('ข้อความเริ่มต้น', { exact: true })).toBeVisible();
  await expect(page.getByText('ฉบับที่ 2', { exact: true })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'ลบบันทึก', exact: true }).click();
  await expect(page.getByText('ข้อความที่แก้ไข', { exact: true })).toHaveCount(0);
});
