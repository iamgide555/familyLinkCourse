import { hash } from 'argon2';
import { createApplication } from '../apps/api/src/app.module.js';
import { SystemClock } from '../apps/api/src/common/clock.js';
import { PrismaService } from '../apps/api/src/database/prisma.service.js';
async function main() {
  const databaseUrl =
    process.env['TEST_DATABASE_URL'] ??
    'postgresql://familylink_test:synthetic-test-only@127.0.0.1:55432/familylink_test';
  if (new URL(databaseUrl).pathname !== '/familylink_test')
    throw new Error('Browser fixtures require the dedicated test database');
  const organizationId = 'familylink-browser-tests';
  const app = await createApplication(
    {
      databaseUrl,
      organizationId,
      production: false,
      webOrigin: 'http://127.0.0.1:4200',
      encryptionKey: Buffer.alloc(32, 11),
      blindIndexKey: Buffer.alloc(32, 22),
      sessionSecret: Buffer.alloc(32, 33),
    },
    new SystemClock(),
  );
  const db = app.get(PrismaService);
  await db.organization.upsert({
    where: { id: organizationId },
    create: { id: organizationId, name: 'ข้อมูลทดสอบ FamilyLink' },
    update: {},
  });
  await db.user.upsert({
    where: { organizationId_email: { organizationId, email: 'admin@familylink.test' } },
    create: {
      organizationId,
      email: 'admin@familylink.test',
      name: 'ผู้ดูแลระบบทดสอบ',
      passwordHash: await hash('Synthetic-password-2026'),
      role: 'admin',
    },
    update: { active: true, role: 'admin' },
  });
  await app.listen(3101, '127.0.0.1');
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
