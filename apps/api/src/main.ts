import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createApplication } from './app.module.js';
import { loadConfig } from './config/config.js';
import { SystemClock } from './common/clock.js';
async function main(): Promise<void> {
  const envPath = resolve(process.cwd(), '../../.env');
  if (existsSync(envPath)) loadEnvFile(envPath);
  const config = loadConfig(process.env);
  const app = await createApplication(config, new SystemClock());
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port, config.production ? '0.0.0.0' : '127.0.0.1');
  console.log(`FamilyLink API listening on port ${port}`);
}
main().catch(() => {
  console.error(
    'FamilyLink startup failed. Check explicit configuration and database availability.',
  );
  process.exit(1);
});
