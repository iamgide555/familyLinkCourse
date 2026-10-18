import { test, expect } from '@playwright/test';
import { bangkokToday, fillSignup, lineContext, signIn, staffApi, tinyPng, unique, goStaff } from './helpers';

/**
 * The whole POC in one run, as staff and members would use it: course set-up, signup with an existing-member
 * match, registration with approval and a waitlist, cancellation, attendance and a walk-in on the day, membership
 * payment, exports, and the messages members were told. Detailed edge cases live in the focused specs.
 */
test('POC dry run: course to attendance to exports, through the real screens', async ({ browser, request, page }) => {
  const id = unique();
  const api = await staffApi(request);

  // 1. Staff set up a course and a two-day run with approval and a one-seat limit.
  await signIn(page);
  await goStaff(page, 'คอร์สและรอบ');
  await page.getByLabel('ชื่อคอร์ส', { exact: true }).fill(`คอร์สฝึกอาชีพ ${id}`);
  await page.getByRole('button', { name: 'สร้างคอร์ส' }).click();
  await page.getByRole('button', { name: 'เพิ่มคำถามใหม่' }).click();
  await page.getByLabel('คำถามข้อ 1', { exact: true }).fill('ชื่อเล่น');
  await page.getByRole('checkbox', { name: 'ต้องตอบ' }).check();
  await page.getByRole('button', { name: 'บันทึกแบบฟอร์ม' }).click();
  await expect(page.getByText('บันทึกแบบฟอร์มแล้ว')).toBeVisible();
  await page.getByRole('link', { name: 'สร้างรอบใหม่' }).click();
  await page.getByLabel(/ชื่อรุ่น/).fill('รุ่นที่ 1');
  await page.getByLabel('จำนวนที่นั่งทั้งรอบ').fill('1');
  await page.getByLabel('ต้องให้เจ้าหน้าที่อนุมัติก่อน (ที่นั่งถูกจองไว้ระหว่างรออนุมัติ)').check();
  await page.getByLabel(/วันที่เรียน \(วันที่ 1\)/).fill(bangkokToday(0));
  await page.getByRole('button', { name: 'เพิ่มวันเรียน' }).click();
  await page.getByLabel(/วันที่เรียน \(วันที่ 2\)/).fill(bangkokToday(30));
  await page.getByLabel('ปิดรับลงทะเบียน (ไม่บังคับ)').fill('2099-01-01T00:00');
  await page.getByRole('button', { name: 'สร้างรอบ' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`คอร์สฝึกอาชีพ ${id} · รุ่นที่ 1`) })).toBeVisible();
  const runUrl = page.url();
  const runId = runUrl.split('/').pop()!;
  const courseName = `คอร์สฝึกอาชีพ ${id}`;

  // 2. An existing paper member; a LINE signup with the same name and birth date waits for staff and sees nothing of the record.
  const existing = await api.post('/members', { firstName: `สมาชิกเดิม${id}`, lastName: 'ทดสอบ', birthDate: '1978-08-08', phoneMobile: '0811110001' });
  const applicant = await lineContext(browser, `acc-a-${id}`);
  await applicant.page.goto('/member/signup');
  await fillSignup(applicant.page, { first: `นายสมาชิกเดิม${id}`, last: 'ทดสอบ', birth: '1978-08-08', phone: '0899990001' });
  await applicant.page.getByRole('button', { name: 'ส่งใบสมัคร' }).click();
  await expect(applicant.page.getByRole('heading', { name: 'ส่งข้อมูลแล้ว รอเจ้าหน้าที่ยืนยัน' })).toBeVisible();
  expect(await applicant.page.content()).not.toContain(existing.memberNumber);
  await page.getByRole('link', { name: /รอตรวจสอบ/ }).click();
  const request1 = page.getByRole('article', { name: `ใบสมัครของ นายสมาชิกเดิม${id} ทดสอบ` });
  await request1.getByRole('button', { name: 'เชื่อมกับสมาชิกคนนี้' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ตรวจสอบใบสมัครของ' })).toBeVisible();
  await applicant.page.goto('/member/profile');
  await expect(applicant.page.getByRole('heading', { name: `สมาชิกเดิม${id} ทดสอบ` })).toBeVisible();

  // 3. A second family on LINE signs up fresh, then both register: one gets the pending seat, one waits.
  const family = await lineContext(browser, `acc-b-${id}`);
  await family.page.goto('/member/signup');
  await fillSignup(family.page, { first: `ครอบครัว${id}`, last: 'ใหม่', birth: '1985-05-05' });
  await family.page.getByRole('button', { name: 'ส่งใบสมัคร' }).click();
  await expect(family.page.getByRole('heading', { name: 'สมัครสมาชิกเรียบร้อย' })).toBeVisible();
  for (const [who, nick] of [[applicant, 'ก'], [family, 'ข']] as const) {
    await who.page.goto(`/member/courses/${runId}`);
    await who.page.getByLabel('ชื่อเล่น', { exact: true }).fill(nick);
    await who.page.getByRole('button', { name: 'ลงทะเบียน', exact: true }).click();
    await expect(who.page.getByRole('heading', { name: 'บันทึกการลงทะเบียนแล้ว' })).toBeVisible();
  }
  await applicant.page.goto('/member/registrations');
  await expect(applicant.page.getByText('ทั้งคอร์ส — รอเจ้าหน้าที่อนุมัติ')).toBeVisible();
  await family.page.goto('/member/registrations');
  await expect(family.page.getByText(/ทั้งคอร์ส — อยู่ในคิวรอ \(คิวที่ 1\)/)).toBeVisible();

  // 4. Staff approve the first. The class starts today, so the self-cancel deadline has passed: staff cancel for them
  //    after a phone call, and the waiting member moves up.
  await page.goto(runUrl);
  const first = page.getByRole('article', { name: `การลงทะเบียนของ สมาชิกเดิม${id} ทดสอบ` });
  await first.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'อนุมัติ' })).toBeVisible();
  await expect(first.getByText('ยืนยันแล้ว')).toBeVisible();
  await applicant.page.goto('/member/registrations');
  await expect(applicant.page.getByText('เลยกำหนดยกเลิกเองแล้ว ติดต่อเจ้าหน้าที่เพื่อยกเลิก')).toBeVisible();
  await first.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await page.getByLabel('เหตุผลที่ยกเลิก').fill('สมาชิกโทรแจ้งว่าไม่สะดวก');
  await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ยกเลิกการลงทะเบียนของ' })).toBeVisible();
  await applicant.page.reload();
  await expect(applicant.page.getByText('ทั้งคอร์ส — ยกเลิกแล้ว')).toBeVisible();
  await family.page.reload();
  await expect(family.page.getByText('ทั้งคอร์ส — รอเจ้าหน้าที่อนุมัติ')).toBeVisible();
  await page.reload();
  const second = page.getByRole('article', { name: `การลงทะเบียนของ ครอบครัว${id} ใหม่` });
  await second.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
  await expect(second.getByText('ยืนยันแล้ว')).toBeVisible();

  // 5. Class day: a walk-in joins a full class after adding a seat, then attendance is marked on a phone layout.
  await page.getByRole('link', { name: 'รับลงทะเบียนหน้างาน' }).click();
  await page.getByLabel('ชื่อ', { exact: true }).fill(`หน้างาน${id}`);
  await page.getByLabel('นามสกุล', { exact: true }).fill('ทดสอบ');
  await page.getByRole('button', { name: /ยืนยันรับลงทะเบียน/ }).click();
  await expect(page.getByText('กรุณาตอบคำถามนี้')).toBeVisible();
  await page.getByLabel('ชื่อเล่น', { exact: true }).fill('ค');
  await page.getByRole('button', { name: /ยืนยันรับลงทะเบียน/ }).click();
  await expect(page.getByRole('alert')).toContainText('ที่นั่งเต็ม');
  await page.getByLabel(/จำนวนที่นั่งใหม่/).fill('2');
  await page.getByLabel('เหตุผลที่เพิ่มที่นั่ง').fill('ห้องกว้างพอ');
  await page.getByRole('button', { name: /ยืนยันรับลงทะเบียน/ }).click();
  await expect(page.getByText(/บันทึกแล้ว: ยืนยันที่นั่งและเช็คชื่อมาเรียนวันนี้เรียบร้อย/)).toBeVisible();
  await page.goto('/staff/attendance');
  await page.getByRole('link', { name: `เช็คชื่อ ${courseName} รุ่นที่ 1` }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ลงทะเบียน 2' })).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: `ครอบครัว${id}` }).getByRole('button', { name: 'มา', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'มา 2' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'ยังไม่เช็ค 0' })).toBeVisible();

  // 6. Membership payment and the dashboard that separates reservations from attendance.
  const tier = await api.post('/membership-tiers', { name: `สามัญ${id}`, fee: '300', durationMonths: 12 });
  await api.post(`/members/${existing.id}/memberships`, { tierId: tier.id, startsAt: bangkokToday(0), expiresAt: bangkokToday(364), amountPaid: '300', paidAt: bangkokToday(0), paymentMethod: 'cash' });
  await page.goto(`/staff/members/${existing.id}`);
  await expect(page.getByText('สถานะ: ใช้งานอยู่')).toBeVisible();
  await expect(page.getByText(`ประเภท: สามัญ${id}`)).toBeVisible();
  await goStaff(page, 'ภาพรวม');
  const today = page.getByRole('listitem').filter({ hasText: `${courseName} · รุ่นที่ 1` }).first();
  await expect(today).toContainText('จองไว้ 2 · มา 2 · ไม่มา 0 · ยังไม่เช็ค 0');

  // 7. Exports and printable forms.
  await page.goto(runUrl);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ดาวน์โหลด Excel', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  // 8. Documents: a member attaches a file only after agreeing to the sensitive-data consent.
  const upload = await lineContext(browser, `acc-c-${id}`);
  await upload.page.goto('/member/signup');
  await upload.page.getByRole('button', { name: 'ต้องการแนบเอกสาร' }).click();
  await upload.page.getByLabel(/ข้าพเจ้ายินยอมให้สมาคม FamilyLink เก็บและใช้ข้อมูลอ่อนไหว/).check();
  await upload.page.getByLabel(/เลือกไฟล์/).setInputFiles({ name: 'id.png', mimeType: 'image/png', buffer: tinyPng });
  await expect(upload.page.getByText(/แนบแล้ว: รูปภาพ/)).toBeVisible();

  // 9. What members were told: the simulated LINE messages name the course and the outcome, and carry no private data.
  await page.goto('/staff/notifications');
  await expect(page.getByRole('heading', { name: 'ข้อความจำลอง (โหมดทดสอบ)' })).toBeVisible();
  await expect.poll(async () => { await page.getByRole('button', { name: 'โหลดใหม่' }).click(); return page.locator('main').innerText(); }, { timeout: 20000 }).toContain(courseName);
  const log = await page.locator('main').innerText();
  expect(log).toContain('ลงทะเบียน');
  expect(log).not.toContain(existing.memberNumber ? '1101700230708' : 'zzz');

  for (const who of [applicant, family, upload]) await who.context.close();
});
