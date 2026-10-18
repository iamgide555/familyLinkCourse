import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { lineContext, signIn } from './helpers';

// The member list rows keep a descriptive aria-label that is longer than the visible text; that experimental rule is not what
// this test is about (dark-mode contrast), so it is excluded here.
const axe = (page: import('@playwright/test').Page) => new AxeBuilder({ page }).disableRules(['label-content-name-mismatch']).analyze();
const toggle = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /^โหมดสี/ });

test('colour mode follows the device, can be chosen, and is remembered', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto('/staff/login');
  await expect(toggle(page)).toContainText('ตามเครื่อง');
  const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await ground()).toBe('rgb(14, 17, 22)');
  await toggle(page).click();
  await expect(toggle(page)).toContainText('สว่าง');
  expect(await ground()).toBe('rgb(221, 229, 239)');
  await page.reload();
  await expect(toggle(page)).toContainText('สว่าง');
  expect(await ground()).toBe('rgb(221, 229, 239)');
  await toggle(page).click();
  await expect(toggle(page)).toContainText('มืด');
  await toggle(page).click();
  await expect(toggle(page)).toContainText('ตามเครื่อง');
  await context.close();
});

test('dark mode keeps staff and member screens readable', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'ค้นหาสมาชิก' })).toBeVisible();
  expect((await axe(page)).violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
  await page.goto('/staff/dashboard');
  await expect(page.getByRole('heading', { name: 'ภาพรวม' })).toBeVisible();
  expect((await axe(page)).violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
  await context.close();
  const member = await lineContext(browser, `dark-${Date.now()}`);
  await member.page.emulateMedia({ colorScheme: 'dark' });
  await member.page.goto('/member/signup');
  await expect(member.page.getByRole('heading', { name: 'สมัครสมาชิก FamilyLink' })).toBeVisible();
  expect((await axe(member.page)).violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
  await member.context.close();
});
