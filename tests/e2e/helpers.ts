import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const ADMIN = { email: 'admin@familylink.test', password: 'Synthetic-password-2026' };
export const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** Signs in through the real login form. */
export async function signIn(page: Page, who = ADMIN): Promise<void> {
  await page.goto('/staff/login');
  await page.getByLabel('อีเมล', { exact: true }).fill(who.email);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL(/\/staff$/);
}

const TAB_OF: Record<string, string> = {
  ค้นหาสมาชิก: 'สมาชิก', เพิ่มสมาชิกจากใบสมัคร: 'สมาชิก', รอตรวจสอบ: 'สมาชิก', สร้างลิงก์สมัคร: 'สมาชิก',
  ภาพรวม: 'วันนี้', เช็คชื่อ: 'วันนี้', ข้อความแจ้งเตือน: 'วันนี้', คอร์สและรอบ: 'คอร์ส',
  รายงาน: 'รายงาน', ตั้งค่าประเภทบริการและเอกสาร: 'รายงาน', ตั้งค่าระบบ: 'รายงาน', บัญชีเจ้าหน้าที่: 'รายงาน',
};
/** Follows a staff page by its name: opens the tab it lives in (one of four), then its chip when the tab has several. */
export async function goStaff(page: Page, name: string): Promise<void> {
  const tab = TAB_OF[name];
  if (!tab) throw new Error(`Unknown staff page: ${name}`);
  const chip = page.getByRole('navigation', { name: 'เมนูย่อย' }).getByRole('link', { name });
  const visible = await chip.waitFor({ state: 'visible', timeout: 400 }).then(() => true, () => false);
  if (!visible) await page.getByRole('navigation', { name: 'เมนูเจ้าหน้าที่' }).getByRole('link', { name: new RegExp(`^${tab}`) }).click();
  // A tab with a single page has no chip row; the tab itself already opened that page.
  if (await chip.waitFor({ state: 'visible', timeout: 1000 }).then(() => true, () => false)) await chip.click();
}

/* Test fixtures read loosely typed JSON from the API. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type StaffApi = {
  get<T = any>(path: string): Promise<T>;
  post<T = any>(path: string, body?: unknown): Promise<T>;
  patch<T = any>(path: string, body?: unknown): Promise<T>;
  put<T = any>(path: string, body?: unknown): Promise<T>;
  raw: APIRequestContext;
};
/* eslint-enable @typescript-eslint/no-explicit-any */
/** Logs the admin in over HTTP for quick fixtures; assertions still go through the UI. */
export async function staffApi(request: APIRequestContext, who = ADMIN): Promise<StaffApi> {
  const login = await request.post('/api/auth/login', { data: who });
  expect(login.ok()).toBeTruthy();
  const { csrfToken } = await login.json();
  const send = async (method: 'get' | 'post' | 'patch' | 'put', path: string, body?: unknown) => {
    const isNewMember = method === 'post' && path === '/members' && body && typeof body === 'object';
    const payload = isNewMember
      ? { ...(!('citizenId' in body) && !('noCitizenId' in body) ? { citizenId: citizenId() } : {}), ...(!('birthDate' in body) ? { birthDate: '1985-05-05' } : {}), ...body }
      : body;
    const response = await request[method](`/api${path}`, { headers: { 'X-CSRF-Token': csrfToken }, ...(payload === undefined ? {} : { data: payload }) });
    if (!response.ok()) throw new Error(`${method} ${path} -> ${response.status()} ${await response.text()}`);
    return response.json();
  };
  return { get: (p) => send('get', p), post: (p, b) => send('post', p, b), patch: (p, b) => send('patch', p, b), put: (p, b) => send('put', p, b), raw: request };
}

/** A fresh browser context acting as one synthetic LINE account. */
export async function lineContext(browser: Browser, id: string): Promise<{ context: BrowserContext; page: Page; id: string }> {
  const context = await browser.newContext();
  await context.addInitScript((value) => localStorage.setItem('fl-dev-line-id', value), `synthetic-${id}`);
  return { context, page: await context.newPage(), id: `synthetic-${id}` };
}
export const lineHeaders = (id: string) => ({ 'x-dev-line-user-id': id });

/** Fills the member signup form through the UI. */
export async function fillSignup(page: Page, v: { first: string; last: string; birth: string; phone?: string; type?: string; relationship?: string; filler?: string; email?: string; citizenId?: string }): Promise<void> {
  if (v.relationship !== undefined) {
    await page.getByLabel('สมัครให้บุคคลในครอบครัวที่ดูแลอยู่').check();
    await page.getByLabel('ท่านเป็นอะไรกับผู้สมัคร (เช่น มารดา บุตร ภรรยา)').fill(v.relationship);
    await page.getByLabel('ชื่อ-นามสกุลของท่าน (ผู้กรอกแบบฟอร์ม)').fill(v.filler ?? 'ผู้ดูแล ทดสอบ');
  }
  await page.getByLabel('ประเภทสมาชิก', { exact: true }).selectOption({ label: v.type ?? 'ผู้ดูแล' });
  await page.getByLabel('ชื่อ', { exact: true }).fill(v.first);
  await page.getByLabel('นามสกุล', { exact: true }).fill(v.last);
  await page.getByLabel('วันเกิด', { exact: true }).fill(v.birth);
  await page.getByLabel('เบอร์มือถือ', { exact: true }).fill(v.phone ?? '0812345678');
  await page.getByLabel('เลขบัตรประชาชน', { exact: true }).fill(v.citizenId ?? citizenId());
  if (v.email) await page.getByLabel('อีเมล (ไม่บังคับ)').fill(v.email);
  await page.getByLabel('จังหวัด', { exact: true }).selectOption('กระบี่');
  await expect(page.getByLabel('อำเภอ / เขต')).toBeEnabled();
  await page.getByLabel('อำเภอ / เขต').selectOption('เกาะลันตา');
  await page.getByLabel('บริการทดสอบ ก').check();
  await page.getByLabel(/ข้าพเจ้าได้อ่านและรับทราบประกาศความเป็นส่วนตัว/).check();
}
export const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export const bangkokToday = (offsetDays = 0): string => new Date(Date.now() + 7 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);
export const sessionInput = (date: string, extra: Record<string, unknown> = {}) => ({ date, startTime: '09:00', endTime: '16:00', location: 'ห้องอบรม', ...extra });
/** Creates course + run over the API for tests that exercise later steps through the UI. */
export async function seedRun(api: StaffApi, opts: { name?: string; capacity?: number; approval?: boolean; waitlist?: boolean; perSession?: boolean; sessions?: Array<Record<string, unknown>>; closes?: string | null; questions?: Array<Record<string, unknown>> } = {}) {
  const course = await api.post('/courses', { name: opts.name ?? `คอร์สทดสอบ ${unique()}` });
  const perSession = opts.perSession ?? false;
  const sessions = opts.sessions ?? [sessionInput(bangkokToday(30), perSession ? { capacity: opts.capacity ?? 5 } : {}), sessionInput(bangkokToday(31), perSession ? { capacity: opts.capacity ?? 5 } : {})];
  let run = await api.post(`/courses/${course.id}/runs`, {
    batchName: `รุ่น ${unique()}`, capacity: perSession ? null : opts.capacity ?? 5, requireApproval: opts.approval ?? false, waitlistEnabled: opts.waitlist ?? true,
    perSessionRegistration: perSession, registrationOpensAt: null, registrationClosesAt: opts.closes ?? null, cancelDeadlineDays: 7, sessions,
  });
  if (opts.questions) run = await api.put(`/runs/${run.id}/questions`, { questions: opts.questions });
  return { course, run, courseName: course.name as string, batchName: run.batchName as string, runId: run.id as string, sessionIds: (run.sessions as Array<{ id: string }>).map((x) => x.id), questions: run.questions as Array<{ id: string; options: Array<{ id: string }> }> };
}
export const question = (label: string, extra: Record<string, unknown> = {}) => ({ label, type: 'short_text', required: false, sensitive: false, ...extra });

/** A signed-up member on its own synthetic LINE account, with a ready browser page. */
export async function joinedMember(browser: Browser, request: APIRequestContext, id: string, first: string, birth = '1983-03-03') {
  const line = await lineContext(browser, id);
  const options = await (await request.get('/api/member/signup/options')).json();
  const response = await request.post('/api/member/signup', {
    headers: lineHeaders(line.id),
    data: { citizenId: citizenId(), firstName: first, lastName: 'ทดสอบ', birthDate: birth, phoneMobile: '0811110000', memberType: 'caregiver', provinceId: 'กระบี่', districtId: 'เกาะลันตา', requestedServiceIds: [options.services[0].id], registeringFor: 'self', privacyConsent: { version: 'v1', consentedBy: 'self', granted: true } },
  });
  expect(response.status()).toBe(201);
  return { ...line, name: `${first} ทดสอบ`, memberId: (await response.json()).memberId as string };
}

/** A valid, unique Thai citizen ID (the e2e database persists between runs, and IDs are unique per organization). */
export function citizenId(): string {
  const base = `1${String(Date.now()).slice(-7)}${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`;
  const sum = [...base].reduce((n, c, i) => n + Number(c) * (13 - i), 0);
  return base + String((11 - (sum % 11)) % 10);
}
