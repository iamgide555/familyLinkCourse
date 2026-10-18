import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { citizenId, joinedMember, seedRun, signIn, staffApi, unique, goStaff } from './helpers';

async function readDownload(download: import('@playwright/test').Download) {
  const path = await download.path();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path!);
  const ws = wb.worksheets[0]!;
  return { headers: (ws.getRow(1).values as unknown[]).slice(1).map(String), rowCount: ws.rowCount - 1 };
}

test('staff exports exclude sensitive columns; admin can opt in; the run page exports registrations', async ({ browser, request, page }) => {
  const id = unique();
  const api = await staffApi(request);
  const email = `export-staff-${id}@familylink.test`;
  await api.post('/staff', { email, name: `ส่งออก${id}`, password: 'Synthetic-password-2026', role: 'staff' });
  await api.post('/members', { firstName: `ส่งออก${id}`, lastName: 'ทดสอบ', citizenId: citizenId(), disabilityType: 'ตัวอย่าง' });
  const seeded = await seedRun(api, { capacity: 5 });
  const m = await joinedMember(browser, request, `exp-${id}`, `ผู้ลงทะเบียน${id}`);
  await api.post(`/runs/${seeded.runId}/registrations`, { memberId: m.memberId, sessionIds: [], answers: {}, operationKey: crypto.randomUUID() });

  const context = await browser.newContext();
  const staffPage = await context.newPage();
  await signIn(staffPage, { email, password: 'Synthetic-password-2026' });
  await goStaff(staffPage, 'รายงาน');
  await expect(staffPage.getByLabel(/รวมข้อมูลอ่อนไหว/)).toHaveCount(0);
  await expect(staffPage.getByText(/ไฟล์ที่เจ้าหน้าที่ส่งออกไม่มีเลขบัตรประชาชน/)).toBeVisible();
  const [staffDownload] = await Promise.all([staffPage.waitForEvent('download'), staffPage.getByRole('button', { name: 'ดาวน์โหลด Excel รายชื่อสมาชิก' }).click()]);
  expect(staffDownload.suggestedFilename()).toMatch(/\.xlsx$/);
  const staffFile = await readDownload(staffDownload);
  expect(staffFile.headers).toContain('เลขสมาชิก');
  expect(staffFile.headers).not.toContain('เลขบัตรประชาชน');
  expect(staffFile.rowCount).toBeGreaterThan(0);
  await staffPage.goto(`/staff/runs/${seeded.runId}`);
  await expect(staffPage.getByLabel(/รวมข้อมูลอ่อนไหว/)).toHaveCount(0);
  const [runDownload] = await Promise.all([staffPage.waitForEvent('download'), staffPage.getByRole('button', { name: 'ดาวน์โหลด Excel', exact: true }).click()]);
  const runFile = await readDownload(runDownload);
  expect(runFile.rowCount).toBe(1);
  expect(runFile.headers).not.toContain('เลขบัตรประชาชน');
  await context.close();

  await signIn(page);
  await page.goto('/staff/reports');
  await page.getByLabel(/รวมข้อมูลอ่อนไหว/).check();
  await expect(page.getByText(/ไฟล์นี้จะมีข้อมูลอ่อนไหว/)).toBeVisible();
  const [adminDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ดาวน์โหลด Excel รายชื่อสมาชิก' }).click()]);
  expect((await readDownload(adminDownload)).headers).toEqual(expect.arrayContaining(['เลขบัตรประชาชน', 'ประเภทความพิการ', 'รายได้ครัวเรือน']));
  await m.context.close();
});
