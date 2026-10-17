import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {path: 'prisma/migrations'},
  datasource: {url: process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'] ?? 'postgresql://familylink_test:synthetic-test-only@127.0.0.1:55432/familylink_test'}
});
