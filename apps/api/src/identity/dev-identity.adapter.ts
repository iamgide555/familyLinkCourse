import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError } from '../common/errors.js';
import type { MemberActor } from '../../../../packages/contracts/src/core.js';
import { ParticipantIdentity } from './identity.service.js';

@Injectable()
export class DevIdentityAdapter extends ParticipantIdentity {
  constructor(
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig & { devIdentityEnabled?: boolean },
    @Inject(PrismaService) private readonly db: PrismaService,
  ) { super(); }
  async resolveOptional(req: Request): Promise<MemberActor | null> {
    const raw = req.headers['x-dev-line-user-id'];
    if (typeof raw !== 'string' || !raw) return null;
    if (this.config.production || process.env['NODE_ENV'] === 'production' || !this.config.devIdentityEnabled)
      throw new AppError(401, 'UNAUTHENTICATED', 'ไม่สามารถยืนยันตัวตน LINE');
    if (!/^synthetic-[a-z0-9_-]{4,80}$/i.test(raw))
      throw new AppError(401, 'UNAUTHENTICATED', 'ตัวตนทดสอบไม่ถูกต้อง');
    const account = await this.db.lineAccount.upsert({
      where: { organizationId_lineUserId: { organizationId: this.config.organizationId, lineUserId: raw } },
      create: { organizationId: this.config.organizationId, lineUserId: raw },
      update: {},
    });
    return { kind: 'member', organizationId: this.config.organizationId, lineAccountId: account.id };
  }
  async resolve(req: Request): Promise<MemberActor> {
    const actor = await this.resolveOptional(req);
    if (!actor) throw new AppError(401, 'UNAUTHENTICATED', 'กรุณาเปิดผ่าน LINE');
    return actor;
  }
}
