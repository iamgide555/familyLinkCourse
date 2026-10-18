import { goStaff, citizenId } from './helpers';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('server validation identifies and focuses invalid mobile input while retaining names', async ({
  page,
}) => {
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByLabel('ชื่อ', { exact: true }).fill('ทดสอบตรวจสอบ');
  await page.getByLabel('นามสกุล', { exact: true }).fill('นามสมมติ');
  await page.getByLabel('เบอร์มือถือ', { exact: true }).fill('12345');
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
  await page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true }).click();
  await expect(page.getByLabel('เบอร์มือถือ', { exact: true })).toBeFocused();
  await expect(page.getByLabel('เบอร์มือถือ', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('ชื่อ', { exact: true })).toHaveValue('ทดสอบตรวจสอบ');
});

const signIn = async (page: import('@playwright/test').Page) => {
  await page.goto('/staff/login');
  await page.getByLabel('อีเมล', { exact: true }).fill('admin@familylink.test');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('Synthetic-password-2026');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/staff$/);
};
// Catches the dead-end shell and verifies the actual save→reload→search→profile workflow.
test('staff can add a paper member, reload, search, open and edit their profile', async ({
  page,
}) => {
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await expect(
    page.getByRole('heading', { name: 'เพิ่มสมาชิกจากใบสมัคร', exact: true }),
  ).toBeVisible();
  const name = `สมมติ${Date.now()}`;
  await page.getByLabel('ชื่อ', { exact: true }).fill(name);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบระบบ');
  await page.getByLabel('เบอร์มือถือ', { exact: true }).fill('0812345678');
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
  await page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'บันทึกสมาชิกแล้ว' })).toBeVisible();
  await expect(page.getByRole('heading', { name: `${name} ทดสอบระบบ`, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: `${name} ทดสอบระบบ`, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'ค้นหาสมาชิก', exact: true }).click();
  await page.getByLabel('ชื่อ เบอร์โทร หรือเลขสมาชิก').fill(name);
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await page.getByRole('link', { name: `เปิดข้อมูล ${name} ทดสอบระบบ` }).click();
  await page.getByRole('link', { name: 'แก้ไขข้อมูล', exact: true }).click();
  await page.getByLabel('อีเมล', { exact: true }).fill('updated@example.test');
  await page.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click();
  await expect(page.getByText('updated@example.test', { exact: true })).toBeVisible();
});

test('missing names focus first field; optional identity information never blocks saving', async ({
  page,
}) => {
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
  await page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true }).click();
  await expect(page.getByLabel('ชื่อ', { exact: true })).toBeFocused();
  await expect(page.getByText('กรุณากรอกชื่อ', { exact: true })).toBeVisible();
});

test('matching name and birth date retains entered values and offers existing or justified new record', async ({
  page,
}) => {
  await signIn(page);
  const name = `ชื่อซ้ำ${Date.now()}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
    await page.getByLabel('ชื่อ', { exact: true }).fill(name);
    await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
    await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1960-01-01');
    await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
    await page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true }).click();
    if (attempt === 0) await expect(page.getByRole('status').filter({ hasText: 'บันทึกสมาชิกแล้ว' })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'พบสมาชิกชื่อและวันเกิดตรงกัน' })).toBeVisible();
  await expect(page.getByLabel('ชื่อ', { exact: true })).toHaveValue(name);
  await expect(page.getByRole('link', { name: `เปิดข้อมูลเดิม ${name} ทดสอบ` })).toHaveText('เปิดข้อมูลเดิม');
  await page.getByLabel('เหตุผลที่สร้างสมาชิกใหม่').fill('ตรวจแล้ว เป็นคนละคน');
  await page.getByRole('button', { name: 'ยืนยันสร้างสมาชิกใหม่' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'บันทึกสมาชิกแล้ว' })).toBeVisible();
});

test('failed edit load keeps the blank form unavailable and offers retry', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/members/failing-load', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'REQUEST_FAILED', message: 'โหลดไม่สำเร็จ' }) }));
  await page.goto('/staff/members/failing-load/edit');
  await expect(page.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'บันทึกการแก้ไข' })).toHaveCount(0);
  await expect(page.getByLabel('ชื่อ', { exact: true })).toHaveCount(0);
});

test('invalid household count opens its section and focuses the bounded field', async ({ page }) => {
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByLabel('ชื่อ', { exact: true }).fill('ครัวเรือน');
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByText('ข้อมูลเพิ่มเติมจากใบสมัคร', { exact: true }).click();
  await page.getByLabel('จำนวนคนในครัวเรือน', { exact: true }).fill('1001');
  await page.getByText('ข้อมูลเพิ่มเติมจากใบสมัคร', { exact: true }).click();
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
  await page.getByRole('button', { name: 'บันทึกสมาชิก' }).click();
  await expect(page.getByLabel('จำนวนคนในครัวเรือน', { exact: true })).toBeFocused();
  await expect(page.getByLabel('จำนวนคนในครัวเรือน', { exact: true })).toHaveAttribute('aria-invalid', 'true');
});

test('stale edit preserves its draft and offers an explicit reload', async ({ page, context }) => {
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  const name = `ฉบับ${Date.now()}`;
  await page.getByLabel('ชื่อ', { exact: true }).fill(name);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
  await page.getByRole('button', { name: 'บันทึกสมาชิก' }).click();
  await expect(page.getByRole('heading', { name: `${name} ทดสอบ`, exact: true })).toBeVisible();
  const memberUrl = page.url();
  await page.getByRole('link', { name: 'แก้ไขข้อมูล', exact: true }).click();
  await page.getByLabel('อีเมล', { exact: true }).fill('draft@example.test');
  const other = await context.newPage();
  await other.goto(memberUrl);
  await other.getByRole('link', { name: 'แก้ไขข้อมูล', exact: true }).click();
  await other.getByLabel('อีเมล', { exact: true }).fill('newer@example.test');
  await other.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
  await expect(other.getByText('newer@example.test', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
  await expect(page.getByRole('alert')).toContainText('ข้อมูลสมาชิกถูกแก้ไขแล้ว');
  await expect(page.getByLabel('อีเมล', { exact: true })).toHaveValue('draft@example.test');
  await expect(page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' })).toBeVisible();
  await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
  await expect(page.getByLabel('อีเมล', { exact: true })).toHaveValue('newer@example.test');
  await other.close();
});

test('address selectors cascade and fill the verified postcode', async ({ page }) => {
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByText('ข้อมูลเพิ่มเติมจากใบสมัคร', { exact: true }).click();
  await page.getByLabel('จังหวัด', { exact: true }).selectOption('นนทบุรี');
  await page.getByLabel('อำเภอหรือเขต', { exact: true }).selectOption('เมืองนนทบุรี');
  await page.getByLabel('ตำบลหรือแขวง', { exact: true }).selectOption('บางกระสอ');
  await expect(page.getByLabel('รหัสไปรษณีย์', { exact: true })).toHaveValue('11000');
});

test('admin can log a PDPA access request and soft delete a member', async ({ page }) => {
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  const name = `สิทธิ${Date.now()}`;
  await page.getByLabel('ชื่อ', { exact: true }).fill(name);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
  await page.getByRole('button', { name: 'บันทึกสมาชิก' }).click();
  await page.getByRole('heading', { name: 'คำขอข้อมูลส่วนบุคคล' }).waitFor();
  await page.getByLabel('ประเภทคำขอ').selectOption('access');
  await page.getByLabel('รายละเอียดคำขอ').fill('เจ้าของข้อมูลขอสำเนา');
  await page.getByRole('button', { name: 'บันทึกคำขอ' }).click();
  await expect(page.getByText('เจ้าของข้อมูลขอสำเนา')).toBeVisible();
  await page.getByLabel('บันทึกผลการดำเนินการ').fill('ส่งสำเนาแล้ว');
  await page.getByRole('button', { name: 'ปิดคำขอเป็นดำเนินการแล้ว' }).click();
  await expect(page.getByText('ดำเนินการแล้ว')).toBeVisible();
  await page.getByLabel('เหตุผลที่ลบสมาชิก').fill('รายการซ้ำ');
  await page.getByRole('button', { name: 'ลบสมาชิก' }).click();
  await expect(page).toHaveURL(/\/staff$/);
});

test('admin configures a service type that staff can select for intake', async ({ page }) => {
  await signIn(page);
  await goStaff(page, 'ตั้งค่าประเภทบริการและเอกสาร');
  const label = `บริการสมมติ${Date.now()}`;
  await page.getByLabel('ชื่อบริการใหม่').fill(label);
  await page.getByRole('button', { name: 'เพิ่มบริการ' }).click();
  await expect(page.getByRole('button', { name: `ปิดใช้งาน ${label}` })).toBeVisible();
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByText('บริการที่สมาชิกต้องการ', { exact: true }).click();
  await page.getByRole('checkbox', { name: label }).check();
  await page.getByLabel('ชื่อ', { exact: true }).fill(`สนใจ${Date.now()}`);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
  await page.getByRole('button', { name: 'บันทึกสมาชิก' }).click();
  await expect(page.getByText(label, { exact: false })).toBeVisible();
});

test('member task screens remain accessible on a narrow phone with enlarged text', async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.evaluate(() => (document.documentElement.style.fontSize = '36px'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const button = page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true });
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('staff can choose an existing caregiver sharing the phone, then open that caregiver profile', async ({
  page,
}) => {
  await signIn(page);
  const suffix = String(Date.now());
  const caregiver = `ผู้ดูแล${suffix}`;
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByLabel('ชื่อ', { exact: true }).fill(caregiver);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ครอบครัวสมมติ');
  await page.getByLabel('เบอร์มือถือ', { exact: true }).fill('0812345678');
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
  await page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'บันทึกสมาชิกแล้ว' })).toBeVisible();
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByLabel('ชื่อ', { exact: true }).fill(`สมาชิก${suffix}`);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ครอบครัวสมมติ');
  await page.getByLabel('เบอร์มือถือ', { exact: true }).fill('0812345678');
  await page.getByText('ผู้ดูแลและผู้ติดต่อฉุกเฉิน', { exact: true }).click();
  await page.getByLabel('ค้นหาผู้ดูแลที่เป็นสมาชิก').fill(caregiver);
  await page.getByRole('button', { name: 'ค้นหาผู้ดูแล', exact: true }).click();
  await page.getByRole('button', { name: `เลือก ${caregiver} ครอบครัวสมมติ`, exact: true }).click();
  await page.getByLabel('ความสัมพันธ์ของผู้ดูแลกับสมาชิก', { exact: true }).fill('มารดา');
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
  await page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `สมาชิก${suffix} ครอบครัวสมมติ`, exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: `${caregiver} ครอบครัวสมมติ`, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `${caregiver} ครอบครัวสมมติ`, exact: true }),
  ).toBeVisible();
});

test('optional intake details stay out of the basic task and retain values when collapsed', async ({
  page,
}) => {
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await expect(
    page.getByRole('heading', { name: 'เพิ่มสมาชิกจากใบสมัคร', exact: true }),
  ).toBeVisible();
  // The ID number is part of the basic task now; the other sensitive details stay behind the section.
  await expect(page.getByLabel('เลขบัตรประชาชน', { exact: true })).toBeVisible();
  await expect(page.getByLabel('ประเภทความพิการ', { exact: true })).not.toBeVisible();
  await page.getByLabel('ชื่อ', { exact: true }).fill(`เพิ่มเติม${Date.now()}`);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByText('ข้อมูลเพิ่มเติมจากใบสมัคร', { exact: true }).click();
  await page.getByLabel('ประเภทความพิการ', { exact: true }).fill('ตัวอย่างสำหรับทดสอบ');
  await page.getByText('ข้อมูลเพิ่มเติมจากใบสมัคร', { exact: true }).click();
  await expect(page.getByLabel('ประเภทความพิการ', { exact: true })).not.toBeVisible();
  await page.getByText('ข้อมูลเพิ่มเติมจากใบสมัคร', { exact: true }).click();
  await expect(page.getByLabel('ประเภทความพิการ', { exact: true })).toHaveValue('ตัวอย่างสำหรับทดสอบ');
});

test('a mistyped ID number focuses the ID field with a clear message', async ({
  page,
}) => {
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByLabel('ชื่อ', { exact: true }).fill('ตรวจเลขบัตร');
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true }).click();
  await expect(page.getByLabel('เลขบัตรประชาชน', { exact: true })).toBeFocused();
  await expect(page.getByText('เลขบัตรประชาชนไม่ถูกต้อง กรุณาตรวจสอบทั้ง 13 หลัก')).toBeVisible();
});

test('invalid email gets a field-level correction instead of an unexplained save failure', async ({
  page,
}) => {
  await signIn(page);
  await goStaff(page, 'เพิ่มสมาชิกจากใบสมัคร');
  await page.getByLabel('ชื่อ', { exact: true }).fill('ตรวจอีเมล');
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByLabel('อีเมล', { exact: true }).fill('incorrect');
  await page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }).fill('1985-05-05');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(citizenId());
  await page.getByRole('button', { name: 'บันทึกสมาชิก', exact: true }).click();
  await expect(page.getByLabel('อีเมล', { exact: true })).toBeFocused();
  await expect(page.getByLabel('อีเมล', { exact: true })).toHaveAttribute('aria-invalid', 'true');
});
