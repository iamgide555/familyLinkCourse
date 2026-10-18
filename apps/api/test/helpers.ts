import request from 'supertest';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import type { TestApp } from './test-app.js';

export type Session = { cookie: string[]; csrf: string };
export const PASSWORD = 'Synthetic-password-2026';
export const consent = { version: 'v1', consentedBy: 'self', granted: true };
export const http = (ctx: TestApp) => request(ctx.app.getHttpServer());

export async function login(ctx: TestApp, email: string, role: 'admin' | 'staff' = 'staff', memberId?: string): Promise<Session> {
  await ctx.db.user.create({ data: { organizationId: ctx.organizationId, email, name: email, role, memberId: memberId ?? null, passwordHash: await hash(PASSWORD) } });
  const response = await http(ctx).post('/api/auth/login').send({ email, password: PASSWORD });
  return { cookie: ([] as string[]).concat(response.headers['set-cookie']), csrf: response.body.csrfToken };
}
/** Logs in an existing user again, e.g. after the test clock moved far enough to expire the old session. */
export async function signin(ctx: TestApp, email: string): Promise<Session> {
  const response = await http(ctx).post('/api/auth/login').send({ email, password: PASSWORD });
  return { cookie: ([] as string[]).concat(response.headers['set-cookie']), csrf: response.body.csrfToken };
}
export function staffCaller(ctx: TestApp, session: Session) {
  return (method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, body?: unknown) => {
    const r = http(ctx)[method](path).set('Cookie', session.cookie);
    const withCsrf = method === 'get' ? r : r.set('X-CSRF-Token', session.csrf);
    return body === undefined ? withCsrf : withCsrf.send(body as object);
  };
}
export const lineHeader = (id: string) => ({ 'x-dev-line-user-id': `synthetic-${id}` });
export const key = () => randomUUID();

/** Creates a member through the real signup endpoint, linked to the given synthetic LINE account. */
export async function joinLine(ctx: TestApp, lineId: string, first: string, last: string, birth: string, serviceTypeId: string, extra: object = {}): Promise<string> {
  const response = await http(ctx).post('/api/member/signup').set(lineHeader(lineId)).send({
    firstName: first, lastName: last, birthDate: birth, phoneMobile: '0812345678', memberType: 'caregiver', provinceId: 'กระบี่',
    districtId: 'เกาะลันตา', requestedServiceIds: [serviceTypeId], registeringFor: 'self', privacyConsent: consent, ...extra,
  });
  if (response.body.kind !== 'created') throw new Error(`signup did not create: ${JSON.stringify(response.body)}`);
  return response.body.memberId as string;
}
export const paperMember = (ctx: TestApp, first: string, birth = '1990-01-01', email = '') =>
  ctx.db.member.create({ data: { organizationId: ctx.organizationId, firstName: first, lastName: 'ทดสอบ', normalizedFirstName: first, normalizedLastName: 'ทดสอบ', birthDate: birth, source: 'paper', email } });

export const session = (date: string, extra: object = {}) => ({ date, startTime: '09:00', endTime: '12:00', location: 'ห้องเรียน', ...extra });
export type RunSetup = Partial<{ capacity: number | null; requireApproval: boolean; waitlistEnabled: boolean; perSession: boolean; opens: string | null; closes: string | null; cancelDays: number; sessions: object[]; batchName: string }>;
/** Course + run with sensible defaults; returns ids. Sessions default to two days in November 2026. */
export async function makeRun(ctx: TestApp, call: ReturnType<typeof staffCaller>, setup: RunSetup = {}) {
  const course = await call('post', '/api/courses', { name: `คอร์สทดสอบ ${randomUUID().slice(0, 6)}` });
  const perSession = setup.perSession ?? false;
  const sessions = setup.sessions ?? [session('2026-11-10', perSession ? { capacity: setup.capacity ?? 2 } : {}), session('2026-11-11', perSession ? { capacity: setup.capacity ?? 2 } : {})];
  const run = await call('post', `/api/courses/${course.body.id}/runs`, {
    batchName: setup.batchName ?? 'รุ่นทดสอบ', capacity: perSession ? null : setup.capacity ?? 2, requireApproval: setup.requireApproval ?? false,
    waitlistEnabled: setup.waitlistEnabled ?? true, perSessionRegistration: perSession, registrationOpensAt: setup.opens ?? null,
    registrationClosesAt: setup.closes ?? null, cancelDeadlineDays: setup.cancelDays ?? 7, sessions,
  });
  if (run.status !== 201) throw new Error(`run create failed: ${JSON.stringify(run.body)}`);
  return { courseId: course.body.id as string, run: run.body, runId: run.body.id as string, sessionIds: (run.body.sessions as Array<{ id: string }>).map((s) => s.id) };
}
export const register = (call: ReturnType<typeof staffCaller>, runId: string, memberId: string, extra: { sessionIds?: string[]; answers?: object; operationKey?: string } = {}) =>
  call('post', `/api/runs/${runId}/registrations`, { memberId, sessionIds: extra.sessionIds ?? [], answers: extra.answers ?? {}, operationKey: extra.operationKey ?? key() });
export const serviceType = async (ctx: TestApp) => (await ctx.db.serviceType.create({ data: { organizationId: ctx.organizationId, name: `บริการ ${randomUUID().slice(0, 6)}` } })).id;
