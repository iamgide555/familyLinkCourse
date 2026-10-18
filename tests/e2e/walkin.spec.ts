import { test, expect } from '@playwright/test';
import { bangkokToday, joinedMember, lineContext, seedRun, sessionInput, signIn, staffApi, unique } from './helpers';

test('staff admit a walk-in to a full class: add seats, bypass the queue with a reason, hand over a link QR', async ({ browser, request, page }) => {
  const id = unique();
  const api = await staffApi(request);
  const seeded = await seedRun(api, { capacity: 1, closes: '2099-01-01T00:00:00.000Z', sessions: [sessionInput(bangkokToday(0))] });
  const seated = await joinedMember(browser, request, `wk1-${id}`, `มีที่แล้ว${id}`);
  const waiting = await joinedMember(browser, request, `wk2-${id}`, `รออยู่${id}`);
  await api.post(`/runs/${seeded.runId}/registrations`, { memberId: seated.memberId, sessionIds: [], answers: {}, operationKey: crypto.randomUUID() });
  await api.post(`/runs/${seeded.runId}/registrations`, { memberId: waiting.memberId, sessionIds: [], answers: {}, operationKey: crypto.randomUUID() });

  await signIn(page);
  await page.goto(`/staff/runs/${seeded.runId}`);
  await page.getByRole('link', { name: 'รับลงทะเบียนหน้างาน' }).click();
  await expect(page.getByRole('heading', { name: /รับลงทะเบียนหน้างาน/ })).toBeVisible();
  await expect(page.getByText(`ผู้ที่รอคิวอยู่ (ไม่ถูกตัดคิว): ${waiting.name}`)).toBeVisible();
  await expect(page.getByText(/ที่นั่งเต็ม ต้องเพิ่มจำนวนที่นั่งพร้อมเหตุผล/)).toBeVisible();
  await page.getByLabel('ชื่อ', { exact: true }).fill(`หน้างาน${id}`);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByLabel('เบอร์มือถือ', { exact: true }).fill('0812223333');
  await page.getByRole('button', { name: /ยืนยันรับลงทะเบียน/ }).click();
  await expect(page.getByRole('alert')).toContainText('ที่นั่งเต็ม');
  await page.getByLabel(/จำนวนที่นั่งใหม่/).fill('2');
  await page.getByLabel('เหตุผลที่เพิ่มที่นั่ง').fill('ห้องกว้างพอ');
  await page.getByRole('button', { name: /ยืนยันรับลงทะเบียน/ }).click();
  await expect(page.getByRole('alert')).toContainText('มีผู้รอคิวอยู่');
  await page.getByLabel('เหตุผลที่รับสมาชิกคนนี้ก่อนผู้ที่รอคิว').fill('ผู้พิการมาถึงก่อนเวลาเรียน');
  await page.getByRole('button', { name: /ยืนยันรับลงทะเบียน/ }).click();
  await expect(page.getByText(/บันทึกแล้ว: ยืนยันที่นั่งและเช็คชื่อมาเรียนวันนี้เรียบร้อย/)).toBeVisible();
  await expect(page.getByText('ทั้งคอร์ส: ยืนยันแล้ว')).toBeVisible();
  await expect(page.getByRole('img', { name: /รหัส QR เชื่อมต่อ LINE/ })).toBeVisible();

  const url = await page.getByLabel('ลิงก์สำหรับส่งต่อ').inputValue();
  const path = new URL(url).pathname + new URL(url).search;
  const scanner = await lineContext(browser, `wk3-${id}`);
  await scanner.page.goto(path);
  await expect(scanner.page.getByText('เชื่อมต่อเรียบร้อยแล้ว')).toBeVisible();
  await scanner.page.getByRole('link', { name: 'ไปที่โปรไฟล์' }).click();
  await expect(scanner.page.getByRole('heading', { name: `หน้างาน${id} ทดสอบ` })).toBeVisible();

  // The waiting member kept their place, and the run now holds the added seat.
  await page.goto(`/staff/runs/${seeded.runId}`);
  await expect(page.getByText('จองแล้ว 2 จาก 2 ที่นั่ง').first()).toBeVisible();
  await expect(page.getByRole('article', { name: `การลงทะเบียนของ ${waiting.name}` })).toContainText('อยู่ในคิวรอ');
  await seated.context.close(); await waiting.context.close(); await scanner.context.close();
});

test('a run with no class today cannot take walk-ins', async ({ request, page }) => {
  const api = await staffApi(request);
  const seeded = await seedRun(api, { capacity: 3, sessions: [sessionInput(bangkokToday(20))] });
  await signIn(page);
  await page.goto(`/staff/runs/${seeded.runId}/walkin`);
  await expect(page.getByText(/ไม่มีวันเรียนในวันนี้/)).toBeVisible();
  await expect(page.getByRole('button', { name: /ยืนยันรับลงทะเบียน/ })).toHaveCount(0);
});
