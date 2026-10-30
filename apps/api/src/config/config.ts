import { resolve } from 'node:path';
export const APP_CONFIG = Symbol('APP_CONFIG');
export interface ApplicationConfig {
  databaseUrl: string;
  organizationId: string;
  webOrigin: string;
  production: boolean;
  encryptionKey: Buffer;
  blindIndexKey: Buffer;
  sessionSecret: Buffer;
  devIdentityEnabled?: boolean;
  documentStorePath?: string;
  /** Real LINE integration. Absent in development, where delivery is simulated. */
  line?: LineConfig;
  email?: EmailConfig;
  /** Production without LINE: staff use the website, nothing is sent over LINE, and members cannot sign in. Email stays optional. */
  staffOnly?: boolean;
  schedulerEnabled?: boolean;
  schedulerIntervalMs?: number;
  /** While this file exists, writes are refused so a backup can capture a consistent database and file set. */
  maintenanceFlag?: string;
}
export type LineConfig = {
  channelAccessToken: string;
  channelSecret: string;
  loginChannelId: string;
  liffId: string;
  apiBase: string;
  richMenuMemberId: string;
  monthlyQuota: number | null;
};
export type EmailConfig = { apiKey: string; from: string; apiBase: string };
export function validateConfig(config: ApplicationConfig): void {
  if (config.production && config.devIdentityEnabled)
    throw new Error('Development identity is forbidden in production');
  for (const [name, key] of Object.entries({
    encryptionKey: config.encryptionKey,
    blindIndexKey: config.blindIndexKey,
    sessionSecret: config.sessionSecret,
  })) {
    if (!Buffer.isBuffer(key) || key.length !== 32)
      throw new Error(`Invalid ${name}: a 32-byte key is required`);
  }
  if (
    config.encryptionKey.equals(config.blindIndexKey) ||
    config.encryptionKey.equals(config.sessionSecret) ||
    config.blindIndexKey.equals(config.sessionSecret)
  )
    throw new Error('Cryptographic keys must be distinct');
  if (!config.databaseUrl || !config.organizationId)
    throw new Error('Database and organization configuration required');
  const origin = new URL(config.webOrigin);
  if (origin.origin !== config.webOrigin || (config.production && origin.protocol !== 'https:'))
    throw new Error('Invalid web origin');
  if (config.staffOnly && (config.line || config.devIdentityEnabled))
    throw new Error('Staff-only mode cannot be combined with LINE configuration or the development identity');
  if (config.production) {
    // Production fails closed: real identity verification and real delivery must be configured, unless the
    // deployment is explicitly staff-only, where members have no login at all.
    if (!config.staffOnly) {
      const line = config.line;
      if (!line?.channelAccessToken || !line.channelSecret || !line.loginChannelId || !line.liffId)
        throw new Error('LINE configuration is required in production');
      if (!/^https:\/\//.test(line.apiBase)) throw new Error('LINE API base must be https in production');
      if (!config.email?.apiKey || !config.email.from) throw new Error('Email configuration is required in production');
    }
    if (config.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email.from)) throw new Error('Email sender address is invalid');
  }
}
export function loadConfig(env: NodeJS.ProcessEnv): ApplicationConfig {
  const key = (name: string): Buffer => {
    const value = env[name]?.trim();
    if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value))
      throw new Error(`Missing or invalid ${name}`);
    return Buffer.from(value, 'base64');
  };
  const production = env['NODE_ENV'] === 'production';
  if (production && env['DEV_IDENTITY_ENABLED'] === 'true')
    throw new Error('Development identity is forbidden in production');
  const config: ApplicationConfig = {
    databaseUrl: env['DATABASE_URL'] ?? '',
    organizationId: env['ORGANIZATION_ID'] ?? '',
    webOrigin: env['WEB_ORIGIN'] ?? '',
    production,
    encryptionKey: key('FIELD_ENCRYPTION_KEY'),
    blindIndexKey: key('BLIND_INDEX_KEY'),
    sessionSecret: key('SESSION_SECRET'),
    staffOnly: env['STAFF_ONLY_MODE'] === 'true',
    devIdentityEnabled: ['development', 'test'].includes(env['NODE_ENV'] ?? '') && env['DEV_IDENTITY_ENABLED'] === 'true',
    documentStorePath: resolve(env['DOCUMENT_STORE_PATH'] ?? '.private/documents'),
    schedulerEnabled: env['SCHEDULER_ENABLED'] !== 'false',
    ...(env['SCHEDULER_INTERVAL_MS'] ? { schedulerIntervalMs: Number(env['SCHEDULER_INTERVAL_MS']) } : {}),
    ...(env['MAINTENANCE_FLAG'] ? { maintenanceFlag: resolve(env['MAINTENANCE_FLAG']) } : {}),
    ...(env['LINE_CHANNEL_ACCESS_TOKEN']
      ? { line: {
          channelAccessToken: env['LINE_CHANNEL_ACCESS_TOKEN'].trim(),
          channelSecret: (env['LINE_CHANNEL_SECRET'] ?? '').trim(),
          loginChannelId: (env['LINE_LOGIN_CHANNEL_ID'] ?? '').trim(),
          liffId: (env['LINE_LIFF_ID'] ?? '').trim(),
          apiBase: (env['LINE_API_BASE'] ?? 'https://api.line.me').trim().replace(/\/$/, ''),
          richMenuMemberId: (env['LINE_RICH_MENU_MEMBER'] ?? '').trim(),
          monthlyQuota: env['LINE_MONTHLY_QUOTA'] ? Number(env['LINE_MONTHLY_QUOTA']) : null,
        } }
      : {}),
    ...(env['EMAIL_API_KEY']
      ? { email: { apiKey: env['EMAIL_API_KEY'].trim(), from: (env['EMAIL_FROM'] ?? '').trim(), apiBase: (env['EMAIL_API_BASE'] ?? 'https://api.resend.com').trim().replace(/\/$/, '') } }
      : {}),
  };
  validateConfig(config);
  return config;
}
