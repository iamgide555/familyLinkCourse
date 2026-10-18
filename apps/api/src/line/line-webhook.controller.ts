import { createHmac, timingSafeEqual } from 'node:crypto';
import { Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/auth.guard.js';
import { AppError } from '../common/errors.js';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { PrismaService } from '../database/prisma.service.js';
import { Clock } from '../common/clock.js';

type LineEvent = { type?: string; webhookEventId?: string; source?: { userId?: string } };
/** Receives follow/unfollow from LINE. Only a correctly signed raw body is acted on; replays are ignored. */
@Controller('line')
export class LineWebhookController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig,
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}
  private valid(raw: Buffer | undefined, signature: unknown): boolean {
    const secret = this.config.line?.channelSecret;
    if (!secret || !raw || typeof signature !== 'string') return false;
    const expected = createHmac('sha256', secret).update(raw).digest();
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
  @Public() @Post('webhook') @HttpCode(200)
  async webhook(@Req() req: Request & { rawBody?: Buffer }) {
    if (!this.config.line) throw new AppError(404, 'NOT_FOUND', 'ไม่พบหน้านี้');
    if (!this.valid(req.rawBody, req.headers['x-line-signature'])) throw new AppError(401, 'UNAUTHENTICATED', 'ลายเซ็นไม่ถูกต้อง');
    const events = ((req.body as { events?: LineEvent[] })?.events ?? []).filter((e) => (e.type === 'follow' || e.type === 'unfollow') && typeof e.source?.userId === 'string');
    const organizationId = this.config.organizationId;
    for (const event of events) {
      if (event.webhookEventId) {
        const fresh = await this.db.operationRecord.createMany({ skipDuplicates: true, data: [{ organizationId, key: `line-event:${event.webhookEventId}`, kind: 'line_event', result: {} }] });
        if (!fresh.count) continue;
      }
      const lineUserId = event.source!.userId!;
      const following = event.type === 'follow';
      const account = await this.db.lineAccount.upsert({
        where: { organizationId_lineUserId: { organizationId, lineUserId } },
        create: { organizationId, lineUserId, reachable: following, ...(following ? {} : { unfollowedAt: this.clock.now() }) },
        update: following ? { reachable: true, unfollowedAt: null, richMenuSyncedState: 'guest' } : { reachable: false, unfollowedAt: this.clock.now() },
      });
      // A returning follower has lost the member menu on LINE's side; mark it unsynced so the next tick restores it.
      if (following && account.richMenuState === 'member') await this.db.lineAccount.update({ where: { id: account.id }, data: { richMenuSyncedState: 'guest' } });
    }
    return {};
  }
}
