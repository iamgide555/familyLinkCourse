import { Inject, Injectable } from '@nestjs/common';
import { hash } from 'argon2';
import type { StaffActor, StaffUser } from '../../../../packages/contracts/src/core.js';
import { PrismaService } from '../database/prisma.service.js';
import { Audit } from '../audit/audit.service.js';
import { AppError } from '../common/errors.js';
import { publicUser } from '../auth/session.service.js';
import type { CreateStaffInput, UpdateStaffInput } from './staff.dto.js';
@Injectable()
export class StaffService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Audit) private readonly audit: Audit,
  ) {}
  async list(actor: StaffActor): Promise<StaffUser[]> {
    return this.db.$transaction(async (tx) => {
      const users = await tx.user.findMany({
        where: { organizationId: actor.organizationId },
        orderBy: { createdAt: 'asc' },
      });
      await this.audit.record(tx, actor, {
        action: 'staff.view',
        entity: 'user',
        entityId: actor.userId,
        fields: ['email', 'name', 'role', 'active'],
      });
      return users.map(publicUser);
    });
  }
  async create(actor: StaffActor, input: CreateStaffInput): Promise<StaffUser> {
    const passwordHash = await hash(input.password);
    return this.db.$transaction(async (tx) => {
      if (
        await tx.user.findUnique({
          where: {
            organizationId_email: { organizationId: actor.organizationId, email: input.email },
          },
        })
      )
        throw new AppError(409, 'EMAIL_EXISTS', 'อีเมลนี้มีบัญชีเจ้าหน้าที่แล้ว');
      const user = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          email: input.email,
          name: input.name,
          role: input.role,
          passwordHash,
        },
      });
      await this.audit.record(tx, actor, {
        action: 'staff.create',
        entity: 'user',
        entityId: user.id,
        fields: ['email', 'name', 'role'],
      });
      return publicUser(user);
    });
  }
  async update(actor: StaffActor, id: string, input: UpdateStaffInput): Promise<StaffUser> {
    const passwordHash = input.password ? await hash(input.password) : undefined;
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${actor.organizationId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { organizationId_id: { organizationId: actor.organizationId, id } },
      });
      if (!user) throw new AppError(404, 'NOT_FOUND', 'ไม่พบบัญชีเจ้าหน้าที่');
      if (
        user.role === 'admin' &&
        user.active &&
        (input.active === false || input.role === 'staff') &&
        (await tx.user.count({
          where: { organizationId: actor.organizationId, role: 'admin', active: true },
        })) <= 1
      )
        throw new AppError(409, 'LAST_ADMIN', 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน');
      if (
        input.memberId &&
        !(await tx.member.findUnique({
          where: {
            organizationId_id: { organizationId: actor.organizationId, id: input.memberId },
          },
        }))
      )
        throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      const updated = await tx.user.update({
        where: { organizationId_id: { organizationId: actor.organizationId, id } },
        data: {
          name: input.name,
          active: input.active,
          role: input.role,
          passwordHash,
          memberId: input.memberId,
        },
      });
      if (
        input.active === false ||
        input.role !== undefined ||
        passwordHash ||
        input.memberId !== undefined
      )
        await tx.session.deleteMany({
          where: { organizationId: actor.organizationId, userId: id },
        });
      await this.audit.record(tx, actor, {
        action: 'staff.update',
        entity: 'user',
        entityId: id,
        fields: Object.keys(input).filter(
          (field) => input[field as keyof UpdateStaffInput] !== undefined,
        ),
      });
      return publicUser(updated);
    });
  }
}
