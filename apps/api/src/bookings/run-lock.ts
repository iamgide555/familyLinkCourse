import { Inject, Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../database/prisma.service.js';
import { AppError } from '../common/errors.js';

/** Serializes every seat-affecting action of one run on a PostgreSQL row lock. */
@Injectable()
export class RunLock {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async withRun<T>(organizationId: string, runId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM course_runs WHERE id = ${runId} AND organization_id = ${organizationId} AND deleted_at IS NULL FOR UPDATE`;
      if (!rows.length) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรอบของคอร์ส');
      return fn(tx);
    }, { timeout: 20000, maxWait: 20000 });
  }
}
