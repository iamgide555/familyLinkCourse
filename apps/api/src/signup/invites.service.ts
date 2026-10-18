import { randomBytes, createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';
import type { InvitePrefill } from '../../../../packages/contracts/src/signup.js';
import { PrismaService, type Tx } from '../database/prisma.service.js';
import { FieldCrypto, type EncryptedValue } from '../crypto/field-crypto.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export const mintToken = (): string => randomBytes(32).toString('base64url');
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
@Injectable()
export class Invites {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig,
  ) {}
  async issue(actor: StaffActor, mode: 'signup' | 'link', memberId: string | null, prefill: InvitePrefill = {}) {
    return this.db.$transaction((tx) => this.issueInTx(tx, actor, mode, memberId, prefill));
  }
  /** Creates a one-time invite inside the caller's transaction (used by walk-in intake). */
  async issueInTx(tx: Tx, actor: StaffActor, mode: 'signup' | 'link', memberId: string | null, prefill: InvitePrefill = {}) {
    if (mode !== 'signup' && mode !== 'link') throw new AppError(422, 'INVALID_INPUT', 'ประเภทลิงก์ไม่ถูกต้อง');
    if ((mode === 'link') !== !!memberId) throw new AppError(422, 'INVALID_INPUT', 'กรุณาระบุสมาชิกสำหรับลิงก์');
    if (Object.keys(prefill).some((key) => !['firstName', 'lastName', 'phoneMobile'].includes(key)) ||
      Object.values(prefill).some((value) => typeof value !== 'string' || value.length > 150))
      throw new AppError(422, 'INVALID_INPUT', 'ข้อมูลเริ่มต้นไม่ถูกต้อง');
    const token = mintToken();
    const expiresAt = new Date(this.clock.now().getTime() + SEVEN_DAYS);
    if (memberId) {
      const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId, deletedAt: null } });
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
    }
    const invite = await tx.signupInvite.create({ data: {
      organizationId: actor.organizationId, tokenHash: hashToken(token), mode,
      createdById: actor.userId, prefillEncrypted: this.crypto.encrypt(JSON.stringify(prefill)),
      expiresAt, memberId,
    } });
    await this.audit.record(tx, actor, { action: 'signup_invite.create', entity: 'signup_invite', entityId: invite.id, fields: ['fields'] });
    const path = mode === 'signup' ? '/member/signup' : '/member/link';
    return { url: `${this.config.webOrigin}${path}?token=${encodeURIComponent(token)}`, token, expiresAt: expiresAt.toISOString() };
  }
  async context(token: string) {
    const invite = await this.db.signupInvite.findFirst({ where: {
      organizationId: this.config.organizationId, tokenHash: hashToken(token), usedAt: null,
      expiresAt: { gt: this.clock.now() },
    } });
    if (!invite) throw new AppError(404, 'INVITE_UNAVAILABLE', 'ลิงก์หมดอายุหรือถูกใช้แล้ว');
    return { mode: invite.mode, prefill: JSON.parse(this.crypto.decrypt(invite.prefillEncrypted as EncryptedValue)) as InvitePrefill, expiresAt: invite.expiresAt.toISOString() };
  }
}
