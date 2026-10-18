import { test, expect } from '@playwright/test';
import { bangkokToday, joinedMember, seedRun, sessionInput, signIn, staffApi, unique } from './helpers';

test('a member cancels before the deadline and the next person in the queue moves up', async ({ browser, request }) => {
  const id = unique();
  const api = await staffApi(request);
  const seeded = await seedRun(api, { capacity: 1 });
  const a = await joinedMember(browser, request, `cx1-${id}`, `ยกเลิก${id}`);
  const b = await joinedMember(browser, request, `cx2-${id}`, `รอคิว${id}`);
  await api.post(`/runs/${seeded.runId}/registrations`, { memberId: a.memberId, sessionIds: [], answers: {}, operationKey: crypto.randomUUID() });
  await api.post(`/runs/${seeded.runId}/registrations`, { memberId: b.memberId, sessionIds: [], answers: {}, operationKey: crypto.randomUUID() });
  await b.page.goto('/member/registrations');
  await expect(b.page.getByText('ทั้งคอร์ส — อยู่ในคิวรอ (คิวที่ 1)')).toBeVisible();
  await a.page.goto('/member/registrations');
  await expect(a.page.getByText(/ยกเลิกเองได้ถึง/)).toBeVisible();
  await a.page.getByRole('button', { name: 'ยกเลิกการลงทะเบียน' }).click();
  await a.page.getByRole('button', { name: 'ไม่ยกเลิก' }).click();
  await expect(a.page.getByText('ทั้งคอร์ส — ยืนยันแล้ว')).toBeVisible();
  await a.page.getByRole('button', { name: 'ยกเลิกการลงทะเบียน' }).click();
  await a.page.getByRole('button', { name: 'ยืนยันยกเลิก' }).click();
  await expect(a.page.getByText('ยกเลิกเรียบร้อยแล้ว')).toBeVisible();
  await expect(a.page.getByText('ทั้งคอร์ส — ยกเลิกแล้ว')).toBeVisible();
  await b.page.reload();
  await expect(b.page.getByText('ทั้งคอร์ส — ยืนยันแล้ว')).toBeVisible();
  await a.context.close();
  await b.context.close();
});

test('after the deadline only staff can cancel, and the member sees it', async ({ browser, request, page }) => {
  const id = unique();
  const api = await staffApi(request);
  const seeded = await seedRun(api, { capacity: 3, sessions: [sessionInput(bangkokToday(3))] });
  const m = await joinedMember(browser, request, `late-${id}`, `เลยกำหนด${id}`);
  await api.post(`/runs/${seeded.runId}/registrations`, { memberId: m.memberId, sessionIds: [], answers: {}, operationKey: crypto.randomUUID() });
  await m.page.goto('/member/registrations');
  await expect(m.page.getByText('เลยกำหนดยกเลิกเองแล้ว ติดต่อเจ้าหน้าที่เพื่อยกเลิก')).toBeVisible();
  await expect(m.page.getByRole('button', { name: /^ยกเลิก/ })).toHaveCount(0);
  await signIn(page);
  await page.goto(`/staff/runs/${seeded.runId}`);
  const card = page.getByRole('article', { name: `การลงทะเบียนของ ${m.name}` });
  await card.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await page.getByLabel('เหตุผลที่ยกเลิก').fill('สมาชิกโทรแจ้งว่าไม่สะดวก');
  await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ยกเลิกการลงทะเบียนของ' })).toBeVisible();
  await m.page.reload();
  await expect(m.page.getByText('ทั้งคอร์ส — ยกเลิกแล้ว')).toBeVisible();
  await m.context.close();
});

test('staff reschedule one day and cancel another; the member sees both changes', async ({ browser, request, page }) => {
  const id = unique();
  const api = await staffApi(request);
  const seeded = await seedRun(api, { perSession: true, capacity: 5 });
  const m = await joinedMember(browser, request, `rs-${id}`, `เลื่อน${id}`);
  await api.post(`/runs/${seeded.runId}/registrations`, { memberId: m.memberId, sessionIds: seeded.sessionIds, answers: {}, operationKey: crypto.randomUUID() });
  await signIn(page);
  await page.goto(`/staff/runs/${seeded.runId}`);
  const dayOne = page.getByRole('listitem').filter({ hasText: 'วันที่ 1' });
  await dayOne.getByText('จัดการ', { exact: true }).click();
  await dayOne.getByRole('button', { name: 'เลื่อนวัน' }).click();
  await page.getByLabel('วันที่ใหม่').fill(bangkokToday(60));
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.getByText('เลื่อนวันเรียนแล้ว และแจ้งผู้ลงทะเบียนแล้ว')).toBeVisible();
  const dayTwo = page.getByRole('listitem').filter({ has: page.getByText('จัดการ', { exact: true }) }).first();
  // The run reloads after the reschedule and can re-render the row, so reopen the menu until it stays open.
  await expect(async () => {
    if (!(await dayTwo.locator('details').evaluate((d: HTMLDetailsElement) => d.open))) await dayTwo.getByText('จัดการ', { exact: true }).click();
    await expect(dayTwo.getByRole('button', { name: 'ยกเลิกวันเรียน' })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
  await dayTwo.getByRole('button', { name: 'ยกเลิกวันเรียน' }).click();
  await page.getByLabel(/เหตุผลที่ยกเลิก/).fill('วิทยากรป่วย');
  await page.getByRole('button', { name: 'ยืนยันยกเลิกวันเรียน' }).click();
  await expect(page.getByText('ยกเลิกวันเรียนแล้ว และแจ้งผู้ลงทะเบียนแล้ว')).toBeVisible();
  await m.page.goto('/member/registrations');
  await expect(m.page.getByText(/วันเรียนถูกยกเลิกโดยสมาคม/)).toBeVisible();
  const text = await m.page.locator('main').innerText();
  expect(text).toContain('ยืนยันแล้ว');
  expect(text).toContain('ยกเลิกแล้ว');
  await m.context.close();
});

test('lowering capacity below the booked seats is refused with the reason shown', async ({ browser, request, page }) => {
  const id = unique();
  const api = await staffApi(request);
  const seeded = await seedRun(api, { capacity: 2 });
  for (const n of [1, 2]) {
    const m = await joinedMember(browser, request, `cap${n}-${id}`, `ที่นั่ง${n}${id}`);
    await api.post(`/runs/${seeded.runId}/registrations`, { memberId: m.memberId, sessionIds: [], answers: {}, operationKey: crypto.randomUUID() });
    await m.context.close();
  }
  await signIn(page);
  await page.goto(`/staff/runs/${seeded.runId}`);
  await page.getByLabel('จำนวนที่นั่งทั้งรอบ').fill('1');
  await page.getByRole('button', { name: 'บันทึกการตั้งค่า' }).click();
  await expect(page.getByRole('alert')).toContainText('ลดที่นั่งต่ำกว่าจำนวนที่ถูกจองแล้ว (2) ไม่ได้');
  await page.getByLabel('จำนวนที่นั่งทั้งรอบ').fill('4');
  await page.getByRole('button', { name: 'บันทึกการตั้งค่า' }).click();
  await expect(page.getByText('บันทึกการตั้งค่าแล้ว')).toBeVisible();
});
