import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const HINT = 'ใช้ตรวจว่าเป็นคนเดียวกับสมาชิกเดิมหรือไม่ ใช้ปี ค.ศ. เช่น พ.ศ. 2500 คือ ค.ศ. 1957';

test('field help shows on hover, keyboard focus and tap, and stays readable to screen readers', async ({ page }) => {
  await signIn(page);
  await page.goto('/staff/members/new');
  const field = page.locator('.intake-field', { has: page.getByLabel('วันเกิด (ค.ศ.)', { exact: true }) });
  const help = field.getByRole('button', { name: 'ดูคำอธิบาย' });
  const bubble = field.getByRole('tooltip');
  await expect(help).toBeVisible();
  await expect(bubble).toBeHidden();
  // The field itself is described by the same text, whether or not the bubble is showing.
  await expect(page.getByLabel('วันเกิด (ค.ศ.)', { exact: true })).toHaveAccessibleDescription(HINT);

  await help.hover();
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveText(HINT);
  await page.mouse.move(5, 300);
  await expect(bubble).toBeHidden();

  await page.keyboard.press('Tab'); // reach the field's help button by keyboard
  await help.focus();
  await expect(bubble).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bubble).toBeHidden();

  await help.click();
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await expect(bubble).toBeVisible();
  await help.click();
  await page.mouse.move(5, 300); // while the pointer rests on the icon the hover keeps it open, as expected
  await expect(bubble).toBeHidden();
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
});

test('on a phone the help bubble opens on tap and stays inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await signIn(page);
  await page.goto('/staff/members/new');
  const field = page.locator('.intake-field', { has: page.getByLabel('เบอร์มือถือ', { exact: true }) });
  await field.getByRole('button', { name: 'ดูคำอธิบาย' }).click();
  const box = (await field.getByRole('tooltip').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await expect(field.getByRole('tooltip')).toContainText('0812345678');
});
