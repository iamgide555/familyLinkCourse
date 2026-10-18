import { expect, test } from '@playwright/test';
import { citizenId, fillSignup, goStaff, lineContext, signIn, unique } from './helpers';

test('staff must give an ID number, or tick "no ID number" with a reason, before a member is saved', async ({ page }) => {
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  const name = `ไม่มีบัตร${unique()}`;
  await page.getByLabel('ชื่อ', { exact: true }).fill(name);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  const id = page.getByLabel('เลขบัตรประชาชน', { exact: true });
  await expect(id).toBeVisible();
  await page.getByRole('button', { name: 'บันทึกสมาชิก' }).click();
  await expect(page.getByText(/กรุณากรอกเลขบัตรประชาชน 13 หลัก/)).toBeVisible();
  await expect(id).toBeFocused();
  await expect(id).toHaveAttribute('aria-invalid', 'true');

  await id.fill('1234567890123');
  await page.getByRole('button', { name: 'บันทึกสมาชิก' }).click();
  await expect(page.getByText('เลขบัตรประชาชนไม่ถูกต้อง กรุณาตรวจสอบทั้ง 13 หลัก')).toBeVisible();

  await page.getByLabel('ไม่มีเลขบัตรประชาชน', { exact: true }).check();
  await expect(id).toBeDisabled();
  await page.getByRole('button', { name: 'บันทึกสมาชิก' }).click();
  await expect(page.getByText('กรุณาระบุเหตุผลที่ไม่มีเลขบัตรประชาชน')).toBeVisible();
  await page.getByLabel('เหตุผลที่ไม่มีเลขบัตรประชาชน').fill('เด็กอายุต่ำกว่า 7 ปี ยังไม่มีบัตร');
  await page.getByRole('button', { name: 'บันทึกสมาชิก' }).click();

  await expect(page.getByRole('heading', { name: `${name} ทดสอบ`, exact: true })).toBeVisible();
  await expect(page.getByText('ไม่มีเลขบัตรประชาชน · เด็กอายุต่ำกว่า 7 ปี ยังไม่มีบัตร')).toBeVisible();
  await expect(page.getByText('ไม่มีเลขบัตร', { exact: true })).toBeVisible();
});

test('a member signing up on LINE must give an ID number or a reason', async ({ browser }) => {
  const member = await lineContext(browser, `idreq-${unique()}`);
  await member.page.goto('/member/signup');
  await fillSignup(member.page, { first: `เลขบัตร${unique()}`, last: 'ทดสอบ', birth: '1982-02-02' });
  const id = member.page.getByLabel('เลขบัตรประชาชน', { exact: true });
  await id.fill('');
  await member.page.getByRole('button', { name: 'ส่งใบสมัคร' }).click();
  await expect(member.page.getByRole('alert')).toContainText('กรุณากรอกเลขบัตรประชาชน 13 หลัก');
  await id.fill(citizenId());
  await member.page.getByRole('button', { name: 'ส่งใบสมัคร' }).click();
  await expect(member.page.getByRole('heading', { name: 'สมัครสมาชิกเรียบร้อย' })).toBeVisible();
  await member.context.close();
});

test('staff cannot save a new member without a birth date', async ({ page }) => {
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByLabel('ชื่อ', { exact: true }).fill(`ไม่มีวันเกิด${unique()}`);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
  await page.getByRole('button', { name: 'บันทึกสมาชิก' }).click();
  await expect(page.getByLabel('วันเกิด (ค.ศ.)', { exact: true })).toBeFocused();
  await expect(page.getByText(/กรุณากรอกวันเกิด/)).toBeVisible();
});

