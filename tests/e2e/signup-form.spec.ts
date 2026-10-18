import { goStaff, citizenId } from './helpers';
import { test, expect, type Page } from '@playwright/test';

async function openSyntheticMember(page: Page) {
  await page.goto('/staff/login');
  await page.getByLabel('อีเมล', { exact: true }).fill('admin@familylink.test');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('Synthetic-password-2026');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByLabel('ชื่อ', { exact: true }).fill(`แบบคำขอ${Date.now()}`);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
  await page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true }).click();
  await expect(page.getByRole('heading', { name: /แบบคำขอ.*ทดสอบ/ })).toBeVisible();
}

test('staff prints PDF, then explicitly records physical signature receipt', async ({ page }) => {
  await openSyntheticMember(page);
  await expect(page.getByText('ยังไม่ได้ลงนาม', { exact: true })).toBeVisible();
  const [popup, pdfResponse] = await Promise.all([
    page.waitForEvent('popup'),
    page.waitForResponse((response) => response.url().endsWith('/api/forms/signup')),
    page.getByRole('button', { name: 'เปิด PDF สำหรับพิมพ์' }).click(),
  ]);
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()['content-type']).toContain('application/pdf');
  await expect(popup.locator('iframe')).toHaveAttribute('src', /^blob:/);
  await popup.close();
  await page.reload();
  await expect(page.getByText('ยังไม่ได้ลงนาม', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ได้รับเอกสารลงนามแล้ว' }).click();
  await page.getByRole('button', { name: 'ยืนยันบันทึกว่าได้รับแล้ว' }).click();
  await expect(page.getByText('ได้รับเอกสารลงนามแล้ว', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('ได้รับเอกสารลงนามแล้ว', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ได้รับเอกสารลงนามแล้ว' })).toHaveCount(0);
});

test('print failure stays visible and can be retried', async ({ page }) => {
  await openSyntheticMember(page);
  await page.route('**/api/forms/signup', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'PDF_UNAVAILABLE', message: 'ยังสร้างแบบคำขอไม่ได้ กรุณาลองอีกครั้ง' }) }),
  );
  await page.getByRole('button', { name: 'เปิด PDF สำหรับพิมพ์' }).click();
  await expect(page.getByRole('alert')).toContainText('ยังสร้างแบบคำขอไม่ได้');
  await page.unroute('**/api/forms/signup');
  const pdfResponse = page.waitForResponse((response) => response.url().endsWith('/api/forms/signup'));
  await page.getByRole('button', { name: 'เปิด PDF สำหรับพิมพ์' }).click();
  expect((await pdfResponse).status()).toBe(200);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
