import { Inject, Injectable } from '@nestjs/common';
import type { MemberActor, StaffActor } from '../../../../packages/contracts/src/core.js';
import { PrismaService, type Tx } from '../database/prisma.service.js';
import { FieldCrypto } from '../crypto/field-crypto.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';
import { Authorization } from '../authorization/authorization.service.js';
import { hashToken } from '../signup/invites.service.js';

@Injectable()
export class Linking {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(Authorization) private readonly authorization: Authorization,
  ) {}

  private async syncMenu(tx: Tx, organizationId: string, lineAccountId: string | null): Promise<void> {
    if (!lineAccountId) return;
    const remaining = await tx.member.count({ where: { organizationId, lineAccountId, deletedAt: null } });
    await tx.lineAccount.updateMany({ where: { organizationId, id: lineAccountId }, data: { richMenuState: remaining ? 'member' : 'guest' } });
  }
  private async record(tx: Tx, data: { organizationId: string; memberId: string; kind: string; from: string | null; to: string | null; reason: string; actorKind: string; actorId: string }) {
    await tx.linkEvent.create({ data: {
      organizationId: data.organizationId, memberId: data.memberId, kind: data.kind,
      fromLineAccountId: data.from, toLineAccountId: data.to,
      reasonEncrypted: this.crypto.encrypt(data.reason), actorKind: data.actorKind, actorId: data.actorId,
    } });
  }

  /** One-time staff-issued QR: links a prepared member to the scanning LINE account. Never replaces an existing link. */
  async redeem(actor: MemberActor, token: string): Promise<{ memberId: string }> {
    if (typeof token !== 'string' || !token) throw new AppError(422, 'INVALID_INPUT', 'ไม่พบรหัสเชื่อมต่อ');
    return this.db.$transaction(async (tx) => {
      const claimed = await tx.signupInvite.updateMany({ where: {
        organizationId: actor.organizationId, tokenHash: hashToken(token), mode: 'link',
        usedAt: null, expiresAt: { gt: this.clock.now() },
      }, data: { usedAt: this.clock.now() } });
      if (claimed.count !== 1) throw new AppError(409, 'INVITE_UNAVAILABLE', 'ลิงก์หมดอายุหรือถูกใช้แล้ว');
      const invite = await tx.signupInvite.findFirstOrThrow({ where: { organizationId: actor.organizationId, tokenHash: hashToken(token) } });
      const member = invite.memberId
        ? await tx.member.findFirst({ where: { organizationId: actor.organizationId, id: invite.memberId, deletedAt: null } })
        : null;
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      if (member.lineAccountId) throw new AppError(409, 'LINK_EXISTS', 'สมาชิกนี้เชื่อมต่อกับ LINE แล้ว กรุณาติดต่อเจ้าหน้าที่');
      await tx.member.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: member.id } }, data: { lineAccountId: actor.lineAccountId, version: { increment: 1 } } });
      await tx.signupInvite.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: invite.id } }, data: { memberId: member.id } });
      await this.record(tx, { organizationId: actor.organizationId, memberId: member.id, kind: 'link_qr', from: null, to: actor.lineAccountId, reason: 'link_qr', actorKind: 'line_account', actorId: actor.lineAccountId });
      await this.syncMenu(tx, actor.organizationId, actor.lineAccountId);
      await this.audit.record(tx, actor, { action: 'member.link', entity: 'member', entityId: member.id, fields: ['fields'] });
      return { memberId: member.id };
    });
  }

  /** Staff remove a member's LINE link. The next LINE account joins through the normal review queue. */
  async unlink(actor: StaffActor, memberId: string, reason: unknown): Promise<{ memberId: string }> {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw new AppError(422, 'INVALID_INPUT', 'กรุณาระบุเหตุผล', { reason: 'กรุณาระบุเหตุผล' });
    return this.db.$transaction(async (tx) => {
      await this.authorization.assertCanReview(tx, actor, memberId);
      const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId, deletedAt: null } });
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      if (!member.lineAccountId) throw new AppError(409, 'NOT_LINKED', 'สมาชิกนี้ยังไม่ได้เชื่อมต่อกับ LINE');
      const from = member.lineAccountId;
      await tx.member.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: memberId } }, data: { lineAccountId: null, version: { increment: 1 } } });
      await tx.profileChangeRequest.updateMany({ where: { organizationId: actor.organizationId, memberId, status: 'pending' }, data: { status: 'rejected', reviewedById: actor.userId, reviewedAt: this.clock.now() } });
      await this.record(tx, { organizationId: actor.organizationId, memberId, kind: 'unlink', from, to: null, reason: reason.trim(), actorKind: 'user', actorId: actor.userId });
      await this.syncMenu(tx, actor.organizationId, from);
      await this.audit.record(tx, actor, { action: 'member.unlink', entity: 'member', entityId: memberId, fields: ['fields'] });
      return { memberId };
    });
  }

  /** A LINE owner removes a member from their own switcher; this only drops that owner's access. */
  async removeOwn(actor: MemberActor, memberId: string): Promise<{ memberId: string }> {
    return this.db.$transaction(async (tx) => {
      const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId, lineAccountId: actor.lineAccountId, deletedAt: null } });
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      await tx.member.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: memberId } }, data: { lineAccountId: null, version: { increment: 1 } } });
      await tx.profileChangeRequest.updateMany({ where: { organizationId: actor.organizationId, memberId, status: 'pending' }, data: { status: 'rejected', reviewedAt: this.clock.now() } });
      await this.record(tx, { organizationId: actor.organizationId, memberId, kind: 'self_remove', from: actor.lineAccountId, to: null, reason: 'self_remove', actorKind: 'line_account', actorId: actor.lineAccountId });
      await this.syncMenu(tx, actor.organizationId, actor.lineAccountId);
      await this.audit.record(tx, actor, { action: 'member.self_remove', entity: 'member', entityId: memberId, fields: ['fields'] });
      return { memberId };
    });
  }
}
