import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { bangkokToday, joinedMember, seedRun, sessionInput, signIn, staffApi, unique, goStaff } from './helpers';

test('staff mark attendance on a phone; marks persist and unmarked stays distinct from absent', async ({ browser, request }) => {
  const id = unique();
  const api = await staffApi(request);
  const seeded = await seedRun(api, { capacity: 10, closes: '2099-01-01T00:00:00.000Z', sessions: [sessionInput(bangkokToday(0)), sessionInput(bangkokToday(1))] });
  const names: string[] = [];
  for (const n of ['มา', 'ขาด', 'ยังไม่เช็ค']) {
    const m = await joinedMember(browser, request, `att${n.length}-${id}`, `${n}${id}`);
    names.push(m.name);
    await api.post(`/runs/${seeded.runId}/registrations`, { memberId: m.memberId, sessionIds: [], answers: {}, operationKey: crypto.randomUUID() });
    await m.context.close();
  }
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  await signIn(page);
  await goStaff(page, 'เช็คชื่อ');
  await page.getByRole('link', { name: `เช็คชื่อ ${seeded.courseName} ${seeded.batchName}` }).click();
  await expect(page.getByRole('heading', { name: `${seeded.courseName} · ${seeded.batchName}` })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'ยังไม่เช็ค 3' })).toBeVisible();
  const row = (name: string) => page.getByRole('listitem').filter({ hasText: name });
  await row(names[0]!).getByRole('button', { name: 'มา', exact: true }).click();
  await expect(row(names[0]!)).toContainText('มาเรียน');
  await row(names[1]!).getByRole('button', { name: 'ไม่มา', exact: true }).click();
  await expect(row(names[1]!)).toContainText('ไม่มา');
  await expect(row(names[2]!)).toContainText('ยังไม่เช็คชื่อ');
  await expect(page.getByRole('status').filter({ hasText: 'มา 1' })).toContainText('ไม่มา 1');
  await expect(page.getByRole('status').filter({ hasText: 'ยังไม่เช็ค 1' })).toBeVisible();
  await page.reload();
  await expect(row(names[0]!)).toContainText('มาเรียน');
  await expect(row(names[1]!)).toContainText('ไม่มา');
  await expect(row(names[2]!)).toContainText('ยังไม่เช็คชื่อ');
  await row(names[0]!).getByRole('button', { name: 'ล้าง' }).click();
  await expect(row(names[0]!)).toContainText('ยังไม่เช็คชื่อ');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const box = await row(names[1]!).getByRole('button', { name: 'ไม่มา', exact: true }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(48);
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  await context.close();
});

test('dashboard separates reservations from attendance and the run page prints unsigned forms', async ({ browser, request, page }) => {
  const id = unique();
  const api = await staffApi(request);
  const seeded = await seedRun(api, { capacity: 5, closes: '2099-01-01T00:00:00.000Z', sessions: [sessionInput(bangkokToday(0))] });
  const m = await joinedMember(browser, request, `dash-${id}`, `แดชบอร์ด${id}`);
  await api.post(`/runs/${seeded.runId}/registrations`, { memberId: m.memberId, sessionIds: [], answers: {}, operationKey: crypto.randomUUID() });
  await api.post(`/sessions/${seeded.sessionIds[0]}/attendance`, { memberId: m.memberId, status: 'present' });
  await signIn(page);
  await goStaff(page, 'ภาพรวม');
  const today = page.getByRole('listitem').filter({ hasText: `${seeded.courseName} · ${seeded.batchName}` }).first();
  await expect(today).toContainText('จองไว้ 1 · มา 1 · ไม่มา 0 · ยังไม่เช็ค 0');
  await expect(page.getByText(/คนที่ลงทะเบียนแล้วแต่ยังไม่ได้ลงนามแบบฟอร์ม/)).toBeVisible();

  await page.goto(`/staff/runs/${seeded.runId}`);
  await expect(page.getByRole('heading', { name: 'แบบฟอร์มและรายงาน' })).toBeVisible();
  await page.getByRole('button', { name: 'เลือกทั้งหมด' }).click();
  const [popup, response] = await Promise.all([
    page.waitForEvent('popup'),
    page.waitForResponse((r) => r.url().endsWith('/api/forms/signup')),
    page.getByRole('button', { name: 'เปิด PDF สำหรับพิมพ์' }).click(),
  ]);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  await expect(popup.locator('iframe')).toHaveAttribute('src', /^blob:/);
  await popup.close();
  await expect(page.getByText('พิมพ์ไม่ถือว่าลงนามแล้ว').or(page.getByText(/การพิมพ์ไม่ถือว่าลงนามแล้ว/))).toBeVisible();
  await page.goto(`/staff/members/${m.memberId}`);
  await expect(page.getByText('ยังไม่ได้ลงนาม', { exact: true }).first()).toBeVisible();
  await m.context.close();
});
