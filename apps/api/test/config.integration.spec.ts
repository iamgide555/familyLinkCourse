import { createApplication } from '../src/app.module.js';
import { MutableClock } from './test-app.js';
import type { ApplicationConfig } from '../src/config/config.js';

// Catches accepting an invalid cryptographic key or development auth in production.
describe('production configuration', () => {
  const valid: ApplicationConfig = {
    databaseUrl: 'postgresql://localhost/test',
    organizationId: 'test',
    webOrigin: 'https://familylink.example.test',
    production: true,
    encryptionKey: Buffer.alloc(32, 1),
    blindIndexKey: Buffer.alloc(32, 2),
    sessionSecret: Buffer.alloc(32, 3),
  };
  it('refuses a missing encryption key before opening resources', async () => {
    await expect(
      createApplication({ ...valid, encryptionKey: Buffer.alloc(0) }, new MutableClock()),
    ).rejects.toThrow();
  });
  it('refuses reusing one key for encryption and blind indexing', async () => {
    await expect(
      createApplication({ ...valid, blindIndexKey: valid.encryptionKey }, new MutableClock()),
    ).rejects.toThrow();
  });
  it('refuses insecure production origin before opening resources', async () => {
    await expect(
      createApplication(
        { ...valid, webOrigin: 'http://familylink.example.test' },
        new MutableClock(),
      ),
    ).rejects.toThrow();
  });
});

import { loadConfig } from '../src/config/config.js';
describe('configuration from environment', () => {
  const env = {
    DATABASE_URL: 'postgresql://localhost/example',
    ORGANIZATION_ID: 'familylink',
    WEB_ORIGIN: 'https://familylink.example.test',
    NODE_ENV: 'production',
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    BLIND_INDEX_KEY: Buffer.alloc(32, 2).toString('base64'),
    SESSION_SECRET: Buffer.alloc(32, 3).toString('base64'),
  };
  it('loads distinct explicit keys without any built-in fallback secret', () => {
    const config = loadConfig(env);
    expect(config.encryptionKey).toEqual(Buffer.alloc(32, 1));
    expect(config.organizationId).toBe('familylink');
    expect(config.production).toBe(true);
  });
  it('refuses to start when an explicit secret is absent', () => {
    expect(() => loadConfig({ ...env, SESSION_SECRET: '' })).toThrow();
  });
  it('refuses development identity configuration in production', () => {
    expect(() => loadConfig({ ...env, DEV_IDENTITY_ENABLED: 'true' })).toThrow();
  });
});
