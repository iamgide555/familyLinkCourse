import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { loadConfig } from '../src/config/config.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { bootstrapAdmin } from '../src/auth/bootstrap-admin.js';
async function main(): Promise<void> {
  if (existsSync('.env')) loadEnvFile('.env');
  const config = loadConfig(process.env);
  const db = new PrismaService(config);
  try {
    await bootstrapAdmin(db, config.organizationId, {
      email: process.env['BOOTSTRAP_ADMIN_EMAIL'] ?? '',
      name: process.env['BOOTSTRAP_ADMIN_NAME'] ?? '',
      password: process.env['BOOTSTRAP_ADMIN_PASSWORD'] ?? '',
    });
    console.log('First admin created. Remove bootstrap password from the environment.');
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Admin creation refused. Provide explicit valid configuration and first-admin credentials; existing admins are never overwritten.',
  );
  process.exit(1);
});
