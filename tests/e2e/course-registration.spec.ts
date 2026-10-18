import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { joinedMember, question, seedRun, signIn, staffApi, unique } from './helpers';

test('a member registers, waits in the queue, and moves up when staff reject the person ahead', async ({ browser, request, page }) => {
  const id = unique();
  const api = await staffApi(request);
  const seeded = await seedRun(api, { capacity: 1, approval: true, questions: [question('ชื่อเล่น', { required: true })] });
  const first = await joinedMember(browser, request, `reg1-${id}`, `คนแรก${id}`);
  const second = await joinedMember(browser, request, `reg2-${id}`, `คนที่สอง${id}`);

  await first.page.goto('/member/courses');
  await first.page.getByRole('link', { name: `ดูคอร์ส ${seeded.courseName} ${seeded.batchName}` }).click();
  await expect(first.page.getByRole('heading', { name: seeded.courseName })).toBeVisible();
  await expect(first.page.getByText('ยังมีที่ว่าง').first()).toBeVisible();
  await first.page.getByRole('button', { name: 'ลงทะเบียน', exact: true }).click();
  await expect(first.page.getByText('กรุณาตอบคำถามนี้')).toBeVisible();
  await first.page.getByLabel('ชื่อเล่น', { exact: true }).fill('เอ');
  await first.page.getByRole('button', { name: 'ลงทะเบียน', exact: true }).click();
  await expect(first.page.getByRole('heading', { name: 'บันทึกการลงทะเบียนแล้ว' })).toBeVisible();
  await expect(first.page.getByText('ทั้งคอร์ส: รอเจ้าหน้าที่อนุมัติ')).toBeVisible();
  await expect(first.page.getByText(/มีที่นั่งจองไว้ให้แล้ว/)).toBeVisible();

  await second.page.goto(`/member/courses/${seeded.runId}`);
  await expect(second.page.getByText('เต็มแล้ว ลงชื่อรอคิวได้').first()).toBeVisible();
  await expect(second.page.getByText(/คุณจะอยู่ในคิวรอและยังไม่มีที่นั่งรับประกัน/)).toBeVisible();
  await second.page.getByLabel('ชื่อเล่น', { exact: true }).fill('บี');
  await second.page.getByRole('button', { name: 'ลงทะเบียน', exact: true }).click();
  await expect(second.page.getByText('ทั้งคอร์ส: อยู่ในคิวรอ (คิวที่ 1)')).toBeVisible();
  await expect(second.page.getByText(/ไม่มีที่นั่งรับประกัน|ยังไม่มีที่นั่งรับประกัน/).first()).toBeVisible();

  await signIn(page);
  await page.goto(`/staff/runs/${seeded.runId}`);
  const firstCard = page.getByRole('article', { name: `การลงทะเบียนของ ${first.name}` });
  await expect(firstCard.getByText('รอเจ้าหน้าที่อนุมัติ')).toBeVisible();
  await firstCard.getByRole('button', { name: 'ดูคำตอบและประวัติการส่ง' }).click();
  await expect(firstCard.getByText('เอ', { exact: true })).toBeVisible();
  const secondCard = page.getByRole('article', { name: `การลงทะเบียนของ ${second.name}` });
  await expect(secondCard.getByText(/อยู่ในคิวรอ \(คิวที่ 1\)/)).toBeVisible();
  await firstCard.getByRole('button', { name: 'ไม่อนุมัติ' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ไม่อนุมัติ' })).toBeVisible();
  await expect(secondCard.getByText('รอเจ้าหน้าที่อนุมัติ')).toBeVisible();

  await second.page.goto('/member/registrations');
  await expect(second.page.getByText('ทั้งคอร์ส — รอเจ้าหน้าที่อนุมัติ')).toBeVisible();
  await first.page.goto('/member/registrations');
  await expect(first.page.getByText('ทั้งคอร์ส — ไม่อนุมัติ')).toBeVisible();
  await first.context.close();
  await second.context.close();
});

test('per-session registration shows each day on its own and saves mixed outcomes', async ({ browser, request }) => {
  const id = unique();
  const api = await staffApi(request);
  const seeded = await seedRun(api, { perSession: true, capacity: 1, approval: false });
  const filler = await joinedMember(browser, request, `mix1-${id}`, `เต็มวัน${id}`);
  const me = await joinedMember(browser, request, `mix2-${id}`, `สองวัน${id}`);
  await filler.page.goto(`/member/courses/${seeded.runId}`);
  await filler.page.getByLabel(/วันที่ 1 ·/).check();
  await filler.page.getByRole('button', { name: 'ลงทะเบียน', exact: true }).click();
  await expect(filler.page.getByText(/วันที่ 1 · .*: ยืนยันแล้ว/)).toBeVisible();

  await me.page.goto(`/member/courses/${seeded.runId}`);
  await expect(me.page.getByText('เต็มแล้ว ลงชื่อรอคิวได้')).toHaveCount(1);
  await me.page.getByRole('button', { name: 'ลงทะเบียน', exact: true }).click();
  await expect(me.page.getByRole('alert')).toContainText('กรุณาเลือกวันเรียนอย่างน้อย 1 วัน');
  await me.page.getByLabel(/วันที่ 1 ·/).check();
  await me.page.getByLabel(/วันที่ 2 ·/).check();
  await expect(me.page.getByText(/ที่นั่งเต็ม คุณจะอยู่ในคิวรอ/).first()).toBeVisible();
  await me.page.getByRole('button', { name: 'ลงทะเบียน', exact: true }).click();
  await expect(me.page.getByText(/วันที่ 1 · .*: อยู่ในคิวรอ \(คิวที่ 1\)/)).toBeVisible();
  await expect(me.page.getByText(/วันที่ 2 · .*: ยืนยันแล้ว/)).toBeVisible();
  await me.page.goto('/member/registrations');
  await expect(me.page.getByText(/วันที่ 1 · .* — อยู่ในคิวรอ \(คิวที่ 1\)/)).toBeVisible();
  await expect(me.page.getByText(/วันที่ 2 · .* — ยืนยันแล้ว/)).toBeVisible();
  await filler.context.close();
  await me.context.close();
});

test('staff can register a member and the member sees it, with a usable phone layout', async ({ browser, request, page }) => {
  const id = unique();
  const api = await staffApi(request);
  const seeded = await seedRun(api, { capacity: 5 });
  const member = await joinedMember(browser, request, `stf-${id}`, `โดยเจ้าหน้าที่${id}`);
  await signIn(page);
  await page.goto(`/staff/runs/${seeded.runId}`);
  await page.getByLabel(/ค้นหาสมาชิก \(ชื่อ เบอร์ หรือเลขสมาชิก\)/).fill(`โดยเจ้าหน้าที่${id}`);
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await page.getByRole('button', { name: 'เลือกคนนี้' }).click();
  await page.getByRole('button', { name: 'บันทึกการลงทะเบียน' }).click();
  await expect(page.getByText('ทั้งคอร์ส: ยืนยันแล้ว')).toBeVisible();
  await expect(page.getByRole('article', { name: `การลงทะเบียนของ ${member.name}` })).toContainText('เจ้าหน้าที่ลงทะเบียนให้');
  await member.page.setViewportSize({ width: 360, height: 740 });
  await member.page.goto('/member/registrations');
  await expect(member.page.getByText('ทั้งคอร์ส — ยืนยันแล้ว')).toBeVisible();
  expect(await member.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page: member.page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  await member.context.close();
});
