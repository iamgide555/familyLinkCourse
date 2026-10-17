import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Catches inaccessible form controls, lost input, confusing recovery and broken staff sessions.
test('staff signs in and signs out using visible Thai controls', async ({ page }) => {
  await page.goto('/staff/login');
  await page.getByLabel('อีเมล').fill('admin@familylink.test');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('Synthetic-password-2026');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByText('ผู้ดูแลระบบทดสอบ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await expect(page).toHaveURL(/\/staff\/login/);
});

test('missing fields focus the first problem rather than silently failing', async ({ page }) => {
  await page.goto('/staff/login');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page.getByLabel('อีเมล')).toBeFocused();
  await expect(page.getByLabel('อีเมล')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('อีเมล').fill('admin@familylink.test');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page.getByLabel('รหัสผ่าน', { exact: true })).toBeFocused();
});

test('password visibility is explicit and preserves the typed password', async ({ page }) => {
  await page.goto('/staff/login');
  const password = page.getByLabel('รหัสผ่าน', { exact: true });
  await password.fill('My-private-password');
  await page.getByRole('button', { name: 'แสดงรหัสผ่าน' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('My-private-password');
  await page.getByRole('button', { name: 'ซ่อนรหัสผ่าน' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});

test('wrong credentials preserve email and explain how to retry', async ({ page }) => {
  await page.goto('/staff/login');
  await page.getByLabel('อีเมล').fill('staff@example.test');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  await expect(page.getByLabel('อีเมล')).toHaveValue('staff@example.test');
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeEnabled();
});

test('expired staff session returns to login with a clear explanation', async ({
  page,
  context,
}) => {
  await page.goto('/staff/login');
  await page.getByLabel('อีเมล').fill('admin@familylink.test');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('Synthetic-password-2026');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await context.clearCookies();
  await page.reload();
  await expect(page).toHaveURL(/\/staff\/login/);
  await expect(page.getByRole('alert')).toContainText('เข้าสู่ระบบอีกครั้ง');
});

test('signing out after session expiry clears stale identity and returns to login', async ({
  page,
  context,
}) => {
  await page.goto('/staff/login');
  await page.getByLabel('อีเมล').fill('admin@familylink.test');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('Synthetic-password-2026');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await context.clearCookies();
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await expect(page).toHaveURL(/\/staff\/login/);
  await expect(page.getByRole('alert')).toContainText('เข้าสู่ระบบอีกครั้ง');
});

test('login is accessible with large controls and no narrow-screen overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/staff/login');
  const submit = page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true });
  await expect(submit).toBeVisible();
  const bounds = await submit.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(48);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
});

test('server validates malformed login independently of the browser form', async ({ request }) => {
  const result = await request.post('http://127.0.0.1:3101/api/auth/login', {
    data: { email: 123, password: ['invalid'] },
    headers: { Origin: 'http://127.0.0.1:4200' },
  });
  expect(result.status()).toBe(422);
});

test('staff can sign in with uppercase email', async ({ page }) => {
  await page.goto('/staff/login');
  await page.getByLabel('อีเมล').fill('ADMIN@FAMILYLINK.TEST');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('Synthetic-password-2026');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/staff$/);
});

test('enlarged text keeps login usable without horizontal scrolling', async ({ page }) => {
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/staff/login');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '36px';
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.getByLabel('อีเมล')).toBeVisible();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    // Excessive scaled gutters must not split the action's Thai word into fragments.
    const actionWordLines = await page
      .getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })
      .evaluate((button) => {
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const start = node.textContent?.indexOf('ระบบ') ?? -1;
          if (start < 0) continue;
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + 'ระบบ'.length);
          return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.y))).size;
        }
        throw new Error('Login action word missing');
      });
    expect(actionWordLines).toBe(1);
  }
});
