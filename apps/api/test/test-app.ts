import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { createApplication } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Clock } from '../src/common/clock.js';
import type { ApplicationConfig } from '../src/config/config.js';

export class MutableClock extends Clock {
  private instant = new Date('2026-10-17T03:00:00.000Z');
  now(): Date {
    return new Date(this.instant);
  }
  set(instant: string): void {
    this.instant = new Date(instant);
  }
  advance(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}
export type TestApp = {
  app: INestApplication;
  db: PrismaService;
  clock: MutableClock;
  organizationId: string;
  close(): Promise<void>;
};
export async function createTestApp(overrides: Partial<ApplicationConfig> = {}): Promise<TestApp> {
  const organizationId = randomUUID();
  const documentStorePath = await mkdtemp(join(tmpdir(), 'familylink-documents-test-'));
  const clock = new MutableClock();
  const app = await createApplication(
    {
      databaseUrl:
        process.env['TEST_DATABASE_URL'] ??
        'postgresql://familylink_test:synthetic-test-only@127.0.0.1:55432/familylink_test',
      organizationId,
      webOrigin: 'http://localhost:4200',
      production: false,
      encryptionKey: Buffer.alloc(32, 11),
      blindIndexKey: Buffer.alloc(32, 22),
      sessionSecret: Buffer.alloc(32, 33),
      devIdentityEnabled: true,
      documentStorePath,
      ...overrides,
    },
    clock,
  );
  const db = app.get(PrismaService);
  await db.organization.create({ data: { id: organizationId, name: 'FamilyLink synthetic test' } });
  await app.listen(0, '127.0.0.1');
  return {
    app,
    db,
    clock,
    organizationId,
    close: async () => {
      try {
        await db.organization.delete({ where: { id: organizationId } });
      } finally {
        await app.close();
        await rm(documentStorePath, { recursive: true, force: true });
      }
    },
  };
}
