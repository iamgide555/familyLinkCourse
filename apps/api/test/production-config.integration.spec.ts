import { createTestApp } from './test-app.js';
import request from 'supertest';
import { loadConfig, validateConfig, type ApplicationConfig } from '../src/config/config.js';
import { scrub, scrubEvent } from '../src/common/telemetry.js';

const keys = () => ({ encryptionKey: Buffer.alloc(32, 1), blindIndexKey: Buffer.alloc(32, 2), sessionSecret: Buffer.alloc(32, 3) });
const production = (over: Partial<ApplicationConfig> = {}): ApplicationConfig => ({
  databaseUrl: 'postgresql://x', organizationId: 'org', webOrigin: 'https://familylink.example.test', production: true, ...keys(),
  line: { channelAccessToken: 't', channelSecret: 's', loginChannelId: 'c', liffId: 'l', apiBase: 'https://api.line.me', richMenuMemberId: 'm', monthlyQuota: null },
  email: { apiKey: 'k', from: 'noreply@example.test', apiBase: 'https://api.resend.com' }, ...over,
});

describe('production configuration fails closed', () => {
  it('accepts a complete production configuration', () => { expect(() => validateConfig(production())).not.toThrow(); });

  it('refuses the development identity, missing secrets, plain-http origins and missing integrations', () => {
    expect(() => validateConfig(production({ devIdentityEnabled: true }))).toThrow(/Development identity/);
    expect(() => validateConfig(production({ webOrigin: 'http://familylink.example.test' }))).toThrow(/web origin/);
    expect(() => validateConfig(production({ encryptionKey: Buffer.alloc(16, 1) }))).toThrow(/32-byte/);
    expect(() => validateConfig(production({ sessionSecret: Buffer.alloc(32, 1) }))).toThrow(/distinct/);
    expect(() => validateConfig(production({ databaseUrl: '' }))).toThrow();
    const { line: _l, ...noLine } = production();
    expect(() => validateConfig(noLine as ApplicationConfig)).toThrow(/LINE configuration/);
    for (const missing of ['channelAccessToken', 'channelSecret', 'loginChannelId', 'liffId'] as const)
      expect(() => validateConfig(production({ line: { ...production().line!, [missing]: '' } }))).toThrow(/LINE configuration/);
    expect(() => validateConfig(production({ line: { ...production().line!, apiBase: 'http://insecure.example' } }))).toThrow(/https/);
    const { email: _e, ...noEmail } = production();
    expect(() => validateConfig(noEmail as ApplicationConfig)).toThrow(/Email configuration/);
    expect(() => validateConfig(production({ email: { apiKey: 'k', from: 'not-an-address', apiBase: 'https://api.resend.com' } }))).toThrow(/sender/);
  });

  it('allows real LINE settings in development without requiring them', () => {
    expect(() => validateConfig({ ...production(), production: false, webOrigin: 'http://127.0.0.1:4200', line: undefined, email: undefined } as ApplicationConfig)).not.toThrow();
  });

  it('reads LINE and email settings from the environment and refuses the dev flag in production', () => {
    const b64 = (n: number) => Buffer.alloc(32, n).toString('base64');
    const env = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://x', ORGANIZATION_ID: 'org', WEB_ORIGIN: 'https://familylink.example.test', FIELD_ENCRYPTION_KEY: b64(1), BLIND_INDEX_KEY: b64(2), SESSION_SECRET: b64(3),
      LINE_CHANNEL_ACCESS_TOKEN: 'tok', LINE_CHANNEL_SECRET: 'sec', LINE_LOGIN_CHANNEL_ID: 'login', LINE_LIFF_ID: 'liff', LINE_MONTHLY_QUOTA: '200', EMAIL_API_KEY: 'k', EMAIL_FROM: 'noreply@example.test' };
    const config = loadConfig(env);
    expect(config.line).toMatchObject({ channelAccessToken: 'tok', apiBase: 'https://api.line.me', monthlyQuota: 200 });
    expect(config.email).toMatchObject({ from: 'noreply@example.test', apiBase: 'https://api.resend.com' });
    expect(() => loadConfig({ ...env, DEV_IDENTITY_ENABLED: 'true' })).toThrow(/Development identity/);
    expect(() => loadConfig({ ...env, LINE_CHANNEL_ACCESS_TOKEN: '' })).toThrow(/LINE configuration/);
  });

  it('boots in production mode with real identity only: the development header is dead', async () => {
    process.env['PDF_RENDERER_URL'] = 'http://127.0.0.1:3002';
    const app = await createTestApp({ ...production({ databaseUrl: process.env['TEST_DATABASE_URL'] ?? 'postgresql://familylink_test:synthetic-test-only@127.0.0.1:55432/familylink_test' }), organizationId: undefined as never }).catch((e: unknown) => e);
    // createTestApp supplies its own organization id; pass the production flag through explicitly.
    void app;
    const live = await createTestApp({ production: true, devIdentityEnabled: false, webOrigin: 'https://familylink.example.test', line: production().line!, email: production().email! });
    try {
      const dev = await request(live.app.getHttpServer()).get('/api/member/me').set('x-dev-line-user-id', 'synthetic-prod-attacker');
      expect(dev.status).toBe(401);
      expect((await request(live.app.getHttpServer()).get('/api/health')).status).toBe(200);
      expect(await live.db.lineAccount.count({ where: { organizationId: live.organizationId } })).toBe(0);
      expect((await request(live.app.getHttpServer()).get('/api/notifications/simulated')).status).toBe(401);
    } finally { await live.close(); }
  });
});

describe('telemetry scrubbing', () => {
  it('removes member data, credentials and bodies before anything is transmitted', () => {
    const event = {
      message: 'Failed for 1101700230708, call 0812345678 or mail somchai@example.test with Bearer abcdefghijklmnopqrstuvwxyz0123456789',
      exception: { values: [{ type: 'Error', value: 'password=hunter2 for citizenId 1101700230708', stacktrace: { frames: [{ filename: 'app.js', vars: { citizenId: '1101700230708', answers: { q: 'เบาหวาน' } } }] } }] },
      request: { headers: { authorization: 'Bearer secret', cookie: 'fl_session=abc' }, data: { firstName: 'สมชาย' } },
      user: { email: 'somchai@example.test' }, extra: { note: 'ข้อมูลลับ' },
    };
    const out = JSON.stringify(scrubEvent(event));
    for (const leak of ['1101700230708', '0812345678', 'somchai@example.test', 'hunter2', 'เบาหวาน', 'สมชาย', 'Bearer secret', 'fl_session', 'ข้อมูลลับ', 'abcdefghijklmnopqrstuvwxyz0123456789']) expect(out).not.toContain(leak);
    expect(out).toContain('[id-number]');
    expect(JSON.stringify(scrub({ ok: 'plain text', phoneMobile: '0812345678', nested: { citizenId: 'x', safe: 1 } }))).toBe('{"ok":"plain text","phoneMobile":"[removed]","nested":{"citizenId":"[removed]","safe":1}}');
  });
});

describe('staff-only production mode (no LINE, optional email)', () => {
  const staffOnly = (over: Partial<ApplicationConfig> = {}): ApplicationConfig => {
    const { line: _l, email: _e, ...rest } = production();
    return { ...rest, staffOnly: true, ...over } as ApplicationConfig;
  };
  it('boots without LINE or email, but refuses to mix with LINE settings or the dev identity', () => {
    expect(() => validateConfig(staffOnly())).not.toThrow();
    expect(() => validateConfig(staffOnly({ email: production().email! }))).not.toThrow();
    expect(() => validateConfig(staffOnly({ email: { apiKey: 'k', from: 'not-an-address', apiBase: 'https://api.resend.com' } }))).toThrow(/sender/);
    expect(() => validateConfig(staffOnly({ line: production().line! }))).toThrow(/Staff-only/);
    expect(() => validateConfig(staffOnly({ production: false, webOrigin: 'http://127.0.0.1:4200', devIdentityEnabled: true }))).toThrow(/Staff-only/);
    expect(() => validateConfig(staffOnly({ webOrigin: 'http://familylink.example.test' }))).toThrow(/web origin/);
  });
  it('is switched on by STAFF_ONLY_MODE and never by default', () => {
    const b64 = (n: number) => Buffer.alloc(32, n).toString('base64');
    const env = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://x', ORGANIZATION_ID: 'org', WEB_ORIGIN: 'https://familylink.example.test', FIELD_ENCRYPTION_KEY: b64(1), BLIND_INDEX_KEY: b64(2), SESSION_SECRET: b64(3) };
    expect(() => loadConfig(env)).toThrow(/LINE configuration/);
    const config = loadConfig({ ...env, STAFF_ONLY_MODE: 'true' });
    expect(config).toMatchObject({ staffOnly: true, production: true });
    expect(config.line).toBeUndefined();
    expect(() => loadConfig({ ...env, STAFF_ONLY_MODE: 'true', DEV_IDENTITY_ENABLED: 'true' })).toThrow(/Development identity/);
  });
  it('boots in production: staff API up, member identity closed, nothing is ever delivered', async () => {
    process.env['PDF_RENDERER_URL'] = 'http://127.0.0.1:3002';
    const live = await createTestApp({ production: true, staffOnly: true, devIdentityEnabled: false, webOrigin: 'https://familylink.example.test' });
    try {
      const api = request(live.app.getHttpServer());
      expect((await api.get('/api/health')).status).toBe(200);
      expect((await request(live.app.getHttpServer()).get('/api/member/me').set('x-dev-line-user-id', 'synthetic-attacker')).status).toBe(401);
      expect((await request(live.app.getHttpServer()).get('/api/member/me').set('Authorization', 'Bearer forged-token')).status).toBe(401);
      expect((await request(live.app.getHttpServer()).post('/api/line/webhook').send({ events: [] })).status).toBe(404);
    } finally { await live.close(); }
  });
});
