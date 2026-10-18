import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { MemberActor } from '../../../../packages/contracts/src/core.js';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../common/errors.js';
import { Clock } from '../common/clock.js';
import { LineApiClient } from '../line/line-api.client.js';
import { ParticipantIdentity } from './identity.service.js';

const CACHE_MS = 5 * 60 * 1000;
/** Real identity: the LIFF ID token is verified with LINE on the server. No browser-supplied user id is ever used. */
@Injectable()
export class LineIdentityAdapter extends ParticipantIdentity {
  private readonly cache = new Map<string, { actor: MemberActor; until: number }>();
  constructor(
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig,
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(LineApiClient) private readonly api: LineApiClient,
    @Inject(Clock) private readonly clock: Clock,
  ) { super(); }
  async resolveOptional(req: Request): Promise<MemberActor | null> {
    const header = req.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    const key = createHash('sha256').update(token).digest('hex');
    const now = this.clock.now();
    const hit = this.cache.get(key);
    if (hit && hit.until > now.getTime()) return hit.actor;
    const claims = await this.api.verifyIdToken(token, now);
    if (!claims) throw new AppError(401, 'UNAUTHENTICATED', 'ไม่สามารถยืนยันตัวตน LINE กรุณาเปิดหน้านี้จากใน LINE อีกครั้ง');
    const organizationId = this.config.organizationId;
    const account = await this.db.lineAccount.upsert({
      where: { organizationId_lineUserId: { organizationId, lineUserId: claims.sub } },
      create: { organizationId, lineUserId: claims.sub, displayName: claims.name ?? '' }, update: claims.name ? { displayName: claims.name } : {},
    });
    const actor: MemberActor = { kind: 'member', organizationId, lineAccountId: account.id };
    this.cache.set(key, { actor, until: now.getTime() + CACHE_MS });
    if (this.cache.size > 500) for (const [k, v] of this.cache) if (v.until <= now.getTime()) this.cache.delete(k);
    return actor;
  }
  async resolve(req: Request): Promise<MemberActor> {
    const actor = await this.resolveOptional(req);
    if (!actor) throw new AppError(401, 'UNAUTHENTICATED', 'กรุณาเปิดหน้านี้จากเมนูใน LINE');
    return actor;
  }
}
