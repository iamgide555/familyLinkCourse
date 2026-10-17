import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Catches dev startup reading a path relative to source instead of the workspace root.
it('loads explicit workspace env configuration when started from the API workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'familylink-startup-'));
  const cwd = join(root, 'apps', 'api');
  await mkdir(cwd, { recursive: true });
  const values = {
    NODE_ENV: 'development',
    DATABASE_URL:
      'postgresql://familylink_test:synthetic-test-only@127.0.0.1:55432/familylink_test',
    ORGANIZATION_ID: 'synthetic-startup-test',
    WEB_ORIGIN: 'http://localhost:4200',
    PORT: '0',
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64'),
    BLIND_INDEX_KEY: Buffer.alloc(32, 22).toString('base64'),
    SESSION_SECRET: Buffer.alloc(32, 33).toString('base64'),
  };
  await writeFile(
    join(root, '.env'),
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
  );
  const env = { ...process.env };
  for (const key of Object.keys(values)) delete env[key];
  const child = spawn(
    process.execPath,
    [
      resolve('node_modules/tsx/dist/cli.mjs'),
      '--tsconfig',
      resolve('apps/api/tsconfig.json'),
      resolve('apps/api/src/main.ts'),
    ],
    { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    const ready = await new Promise<boolean>((resolveReady) => {
      const timer = setTimeout(() => resolveReady(false), 8000);
      child.stdout.on('data', (data) => {
        if (String(data).includes('FamilyLink API listening')) {
          clearTimeout(timer);
          resolveReady(true);
        }
      });
      child.on('exit', () => {
        clearTimeout(timer);
        resolveReady(false);
      });
    });
    expect(ready).toBe(true);
  } finally {
    child.kill('SIGTERM');
    await rm(root, { recursive: true, force: true });
  }
});
