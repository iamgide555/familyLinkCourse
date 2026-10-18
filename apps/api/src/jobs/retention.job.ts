import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Documents } from '../documents/documents.service.js';
import { OrgSettings } from '../settings/org-settings.service.js';

const DAY = 24 * 60 * 60 * 1000;
/**
 * Daily cleanup. Pending/rejected signup requests and unsubmitted upload drafts expire on their own clocks;
 * soft-deleted members are only purged once an administrator has set a retention period (default: keep forever).
 */
@Injectable()
export class Retention {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Documents) private readonly documents: Documents,
    @Inject(OrgSettings) private readonly settings: OrgSettings,
  ) {}
  async purge(now: Date, organizationId: string): Promise<{ signupRequests: number; drafts: number; members: number }> {
    const cutoff = new Date(now.getTime() - 30 * DAY);
    const stale = await this.db.signupRequest.findMany({ where: { organizationId, OR: [{ status: 'rejected', resolvedAt: { lt: cutoff } }, { status: 'pending', createdAt: { lt: cutoff } }] }, select: { id: true } });
    for (const { id } of stale) {
      await this.documents.purgeWhere({ organizationId, signupRequestId: id });
      await this.db.signupRequest.delete({ where: { organizationId_id: { organizationId, id } } });
    }
    const drafts = await this.documents.cleanupExpiredDrafts(now);
    const { retention } = await this.settings.get(organizationId);
    const days = [retention.generalDays, retention.sensitiveDays].filter((d): d is number => typeof d === 'number');
    let members = 0;
    if (days.length) {
      const expired = await this.db.member.findMany({ where: { organizationId, deletedAt: { lt: new Date(now.getTime() - Math.min(...days) * DAY) } }, select: { id: true } });
      for (const { id } of expired) {
        await this.documents.purgeWhere({ organizationId, memberId: id });
        await this.db.$transaction([
          this.db.member.updateMany({ where: { organizationId, caregiverMemberId: id }, data: { caregiverMemberId: null } }),
          this.db.pdpaRequest.deleteMany({ where: { organizationId, memberId: id } }),
          this.db.consent.deleteMany({ where: { organizationId, memberId: id } }),
          this.db.attendance.deleteMany({ where: { organizationId, memberId: id } }),
          this.db.profileChangeRequest.deleteMany({ where: { organizationId, memberId: id } }),
          this.db.linkEvent.deleteMany({ where: { organizationId, memberId: id } }),
          this.db.notification.deleteMany({ where: { organizationId, recipientKind: 'member', recipientId: id } }),
          this.db.member.delete({ where: { organizationId_id: { organizationId, id } } }),
        ]);
        members += 1;
      }
    }
    return { signupRequests: stale.length, drafts, members };
  }
}
