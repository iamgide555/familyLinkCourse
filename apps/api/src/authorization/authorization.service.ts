import { Injectable } from '@nestjs/common';
import type { Actor, Role, StaffActor } from '../../../../packages/contracts/src/core.js';
import type { Tx } from '../database/prisma.service.js';
import { AppError } from '../common/errors.js';
@Injectable()
export class Authorization {
  requireRole(actor: Actor, roles: Role[]): void {
    if (actor.kind !== 'staff' || !roles.includes(actor.role))
      throw new AppError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์ทำรายการนี้');
  }
  async assertCanReview(tx: Tx, actor: StaffActor, memberId: string): Promise<void> {
    const target = await tx.member.findUnique({
      where: { organizationId_id: { organizationId: actor.organizationId, id: memberId } },
    });
    if (!target) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
    if (!actor.memberId) return;
    if (actor.memberId === memberId)
      throw new AppError(403, 'SELF_REVIEW_FORBIDDEN', 'กรุณาให้เจ้าหน้าที่คนอื่นตรวจสอบรายการนี้');
    const own = await tx.member.findUnique({
      where: { organizationId_id: { organizationId: actor.organizationId, id: actor.memberId } },
    });
    if (own?.lineAccountId && own.lineAccountId === target.lineAccountId)
      throw new AppError(
        403,
        'SELF_REVIEW_FORBIDDEN',
        'กรุณาให้เจ้าหน้าที่คนอื่นตรวจสอบรายการของครอบครัว',
      );
  }
}
