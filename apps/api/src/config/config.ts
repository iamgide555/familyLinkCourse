export const APP_CONFIG = Symbol('APP_CONFIG');
export interface ApplicationConfig {
  databaseUrl: string;
  organizationId: string;
  webOrigin: string;
  production: boolean;
  encryptionKey: Buffer;
  blindIndexKey: Buffer;
  sessionSecret: Buffer;
}
export function validateConfig(config: ApplicationConfig): void {
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
  };
  validateConfig(config);
  return config;
}
