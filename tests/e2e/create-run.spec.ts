import { test, expect } from '@playwright/test';
import { bangkokToday, signIn, unique, goStaff } from './helpers';

test('staff create a course, a run with two days and a question, and see it locked after the first booking', async ({ page, request }) => {
  const id = unique();
  await signIn(page);
  await goStaff(page, 'คอร์สและรอบ');
  await page.getByLabel('ชื่อคอร์ส', { exact: true }).fill(`คอร์สสร้างทดสอบ ${id}`);
  await page.getByLabel('คำอธิบายสั้น ๆ (ไม่บังคับ)').fill('คอร์สสำหรับทดสอบระบบ');
  await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
  await expect(page.getByRole('heading', { name: `คอร์สสร้างทดสอบ ${id}`, level: 1 })).toBeVisible();

  // Default question for the course.
  await page.getByRole('button', { name: 'เพิ่มคำถามใหม่' }).click();
  await page.getByLabel('คำถามข้อ 1', { exact: true }).fill('ชื่อเล่น');
  await page.getByRole('checkbox', { name: 'ต้องตอบ' }).check();
  await page.getByRole('button', { name: 'บันทึกแบบฟอร์ม' }).click();
  await expect(page.getByText('บันทึกแบบฟอร์มแล้ว')).toBeVisible();

  await page.getByRole('link', { name: 'สร้างรอบใหม่' }).click();
  await page.getByRole('button', { name: 'สร้างรอบ' }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('กรุณาระบุชื่อรุ่น');
  await page.getByLabel(/ชื่อรุ่น/).fill('รุ่นที่ 1');
  await page.getByLabel('จำนวนที่นั่งทั้งรอบ').fill('3');
  await page.getByLabel(/วันที่เรียน \(วันที่ 1\)/).fill(bangkokToday(40));
  await page.getByRole('button', { name: 'เพิ่มวันเรียน' }).click();
  await page.getByLabel(/วันที่เรียน \(วันที่ 2\)/).fill(bangkokToday(41));
  await page.getByRole('button', { name: 'สร้างรอบ' }).click();
  await expect(page.getByRole('heading', { name: `คอร์สสร้างทดสอบ ${id} · รุ่นที่ 1` })).toBeVisible();
  await expect(page.getByText('จองแล้ว 0 จาก 3 ที่นั่ง').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'แบบฟอร์มคำถามของรอบนี้' })).toBeVisible();
  await expect(page.getByLabel('คำถามข้อ 1', { exact: true })).toHaveValue('ชื่อเล่น');
  await page.reload();
  await expect(page.getByLabel('คำถามข้อ 1', { exact: true })).toHaveValue('ชื่อเล่น');
  for (const menu of await page.getByText('จัดการ', { exact: true }).all()) await menu.click();
  await expect(page.getByRole('button', { name: 'ลบ', exact: true })).toHaveCount(2);

  // After a booking, structure is locked and the UI says so; template edits do not touch the run.
  const runId = page.url().split('/').pop()!;
  const login = await request.post('/api/auth/login', { data: { email: 'admin@familylink.test', password: 'Synthetic-password-2026' } });
  const csrf = (await login.json()).csrfToken;
  const member = await (await request.post('/api/members', { headers: { 'X-CSRF-Token': csrf }, data: { firstName: `ล็อก${id}`, lastName: 'ทดสอบ' } })).json();
  const run = await (await request.get(`/api/runs/${runId}`)).json();
  const answers = { [run.questions[0].id]: 'เอ' };
  expect((await request.post(`/api/runs/${runId}/registrations`, { headers: { 'X-CSRF-Token': csrf }, data: { memberId: member.id, sessionIds: [], answers, operationKey: crypto.randomUUID() } })).status()).toBe(201);
  await page.reload();
  await expect(page.getByText(/มีผู้ลงทะเบียนแล้ว เปลี่ยนรูปแบบการลงทะเบียนและการอนุมัติไม่ได้อีก/)).toBeVisible();
  await expect(page.getByLabel('ต้องให้เจ้าหน้าที่อนุมัติ')).toBeDisabled();
  await expect(page.getByLabel('ลงทะเบียนรายวัน', { exact: true })).toBeDisabled();
  await expect(page.getByText(/เพิ่มหรือลบวันเรียนไม่ได้/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'ลบคำถามนี้' })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'ต้องตอบ' })).toBeEnabled();
});

test('per-session runs ask for a seat count on every day', async ({ page }) => {
  const id = unique();
  await signIn(page);
  await goStaff(page, 'คอร์สและรอบ');
  await page.getByLabel('ชื่อคอร์ส', { exact: true }).fill(`คอร์สรายวัน ${id}`);
  await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
  await page.getByRole('link', { name: 'สร้างรอบใหม่' }).click();
  await page.getByLabel(/ชื่อรุ่น/).fill('รุ่นรายวัน');
  await page.getByLabel(/ลงทะเบียนรายวัน/).check();
  await expect(page.getByLabel('จำนวนที่นั่งทั้งรอบ')).toHaveCount(0);
  await page.getByLabel(/วันที่เรียน \(วันที่ 1\)/).fill(bangkokToday(50));
  await page.getByRole('button', { name: 'สร้างรอบ' }).click();
  await expect(page.getByRole('alert')).toContainText('กรุณาระบุที่นั่งของวันเรียนที่ 1');
  await page.getByLabel('จำนวนที่นั่งของวันนี้').fill('2');
  await page.getByRole('button', { name: 'สร้างรอบ' }).click();
  await expect(page.getByRole('heading', { name: /รุ่นรายวัน/ })).toBeVisible();
  await expect(page.getByText(/จองแล้ว 0\/2 ที่นั่ง/)).toBeVisible();
});
