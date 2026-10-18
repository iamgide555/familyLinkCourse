import { expect, test } from '@playwright/test';
import { goStaff, seedRun, signIn, staffApi } from './helpers';

const tabs = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'เมนูเจ้าหน้าที่' });
const chips = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'เมนูย่อย' });

test('four tabs group the pages by job and always show their sibling pages', async ({ page }) => {
  await signIn(page);
  await expect(tabs(page).getByRole('link')).toHaveText([/^สมาชิก/, /^วันนี้/, /^คอร์ส/, /^รายงานและตั้งค่า/]);
  await expect(tabs(page).getByRole('link', { name: /^สมาชิก/ })).toHaveAttribute('aria-current', 'page');
  await expect(chips(page).getByRole('link')).toHaveText([/ค้นหาสมาชิก/, /เพิ่มสมาชิกจากใบสมัคร/, /รอตรวจสอบ/, /สร้างลิงก์สมัคร/]);

  await tabs(page).getByRole('link', { name: /^วันนี้/ }).click();
  await expect(chips(page).getByRole('link')).toHaveText([/ภาพรวม/, /เช็คชื่อ/, /ข้อความแจ้งเตือน/]);
  await goStaff(page, 'เช็คชื่อ');
  await expect(page.getByRole('heading', { name: 'เช็คชื่อ', level: 1 })).toBeVisible();
  await expect(tabs(page).getByRole('link', { name: /^วันนี้/ })).toHaveAttribute('aria-current', 'page');

  await tabs(page).getByRole('link', { name: /^คอร์ส/ }).click();
  await expect(page.getByRole('heading', { name: 'คอร์ส', level: 1 })).toBeVisible();
  await expect(chips(page)).toHaveCount(0);

  await tabs(page).getByRole('link', { name: /^รายงานและตั้งค่า/ }).click();
  await expect(chips(page).getByRole('link')).toHaveText([/^รายงาน/, /ตั้งค่าประเภทบริการและเอกสาร/, /ตั้งค่าระบบ/, /บัญชีเจ้าหน้าที่/]);
  await goStaff(page, 'บัญชีเจ้าหน้าที่');
  await expect(page.getByRole('heading', { name: 'บัญชีเจ้าหน้าที่', level: 1 })).toBeVisible();
  await expect(tabs(page).getByRole('link', { name: /^รายงานและตั้งค่า/ })).toHaveAttribute('aria-current', 'page');
});

test('a page deep inside a job keeps its tab highlighted', async ({ page, request }) => {
  const api = await staffApi(request);
  const seeded = await seedRun(api, {});
  await signIn(page);
  await page.goto(`/staff/runs/${seeded.runId}`);
  await expect(tabs(page).getByRole('link', { name: /^คอร์ส/ })).toHaveAttribute('aria-current', 'page');
  await page.goto(`/staff/attendance/${seeded.sessionIds[0]}`);
  await expect(tabs(page).getByRole('link', { name: /^วันนี้/ })).toHaveAttribute('aria-current', 'page');
});

test('on a phone the four tabs sit in a bar at the bottom and nothing is hidden behind a menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await signIn(page);
  const links = tabs(page).getByRole('link');
  await expect(links).toHaveCount(4);
  for (const link of await links.all()) {
    const box = (await link.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(780 - 12);
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await expect(page.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
