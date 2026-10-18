import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { PrismaService } from '../database/prisma.service.js';
import { Clock } from '../common/clock.js';
import { bangkokDate, bangkokTime } from '../common/bangkok.js';
import { NotificationWorker } from '../notifications/notification-worker.js';
import { Reminders } from '../notifications/reminders.service.js';
import { RichMenus } from '../line/rich-menu.service.js';
import { Retention } from './retention.job.js';

const tomorrow = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
/**
 * One in-process scheduler. Every few seconds it sends due notices and syncs LINE menus; once a day (Asia/Bangkok)
 * it creates tomorrow's reminders at 09:00 and runs cleanup. Daily jobs are recorded, so a restart never repeats them.
 * Registration open/close needs no job: the API checks the times on every request.
 */
@Injectable()
export class Scheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  constructor(
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig,
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(NotificationWorker) private readonly worker: NotificationWorker,
    @Inject(Reminders) private readonly reminders: Reminders,
    @Inject(RichMenus) private readonly menus: RichMenus,
    @Inject(Retention) private readonly retention: Retention,
  ) {}
  onModuleInit(): void {
    if (!this.config.schedulerEnabled) return;
    this.timer = setInterval(() => void this.tick(), Math.max(500, this.config.schedulerIntervalMs ?? 15_000));
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
  async tick(now: Date = this.clock.now()): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.worker.tick(now);
      await this.menus.syncPending();
      await this.daily(now);
    } catch (error) {
      console.error('Scheduler tick failed:', error instanceof Error ? error.message : 'unknown error');
    } finally { this.busy = false; }
  }
  private async once(key: string, task: () => Promise<unknown>): Promise<void> {
    const organizationId = this.config.organizationId;
    if (await this.db.operationRecord.findUnique({ where: { organizationId_key: { organizationId, key } } })) return;
    await task();
    await this.db.operationRecord.createMany({ skipDuplicates: true, data: [{ organizationId, key, kind: 'job', result: {} }] });
  }
  async daily(now: Date): Promise<void> {
    const organizationId = this.config.organizationId;
    const date = bangkokDate(now);
    const hour = Number(bangkokTime(now).slice(0, 2));
    if (hour >= 9) await this.once(`job:reminders:${organizationId}:${date}`, () => this.reminders.createForDate(organizationId, tomorrow(date)));
    if (hour >= 3) await this.once(`job:retention:${organizationId}:${date}`, () => this.retention.purge(now, organizationId));
  }
}
