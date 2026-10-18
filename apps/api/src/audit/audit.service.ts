import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../../packages/contracts/src/core.js';
import type { Tx } from '../database/prisma.service.js';
export type AuditEvent = { action: string; entity: string; entityId: string; fields: string[] };
const ALLOWED_FIELDS = new Set([
  'email',
  'name',
  'role',
  'active',
  'memberId',
  'password',
  'firstName',
  'lastName',
  'birthDate',
  'phoneMobile',
  'citizenId',
  'signedFormAt',
  'body',
  'deletedAt',
  'source',
  'fields',
  'provinceId', 'districtId', 'subdistrictId', 'postcode', 'requestedServiceIds',
  'memberType',
  'disabilityType',
  'householdIncome',
  'householdSize',
  'householdEarners',
  'address',
  'phoneHome',
  'facebook',
  'maritalStatus',
  'education',
  'occupation',
  'housing',
  'caregiverMemberId',
  'caregiverName',
  'caregiverRelationship',
  'caregiverPhone',
  'emergencyName',
  'emergencyRelationship',
  'emergencyPhone',
  'description', 'batchName', 'location', 'capacity', 'requireApproval', 'waitlistEnabled', 'perSessionRegistration',
  'registrationOpensAt', 'registrationClosesAt', 'cancelDeadlineDays', 'status', 'date', 'startTime', 'endTime', 'onlineUrl',
  'questions', 'serviceTypeIds', 'amount', 'tier', 'expiresAt', 'startsAt', 'paidAt', 'method', 'receiptNo',
]);
@Injectable()
export class Audit {
  async record(tx: Tx, actor: Actor, event: AuditEvent): Promise<void> {
    if (event.fields.some((field) => !ALLOWED_FIELDS.has(field)))
      throw new Error('Unknown audit field');
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorType:
          actor.kind === 'staff' ? 'user' : actor.kind === 'member' ? 'line_account' : 'system',
        actorId:
          actor.kind === 'staff'
            ? actor.userId
            : actor.kind === 'member'
              ? actor.lineAccountId
              : null,
        action: event.action,
        entity: event.entity,
        entityId: event.entityId,
        fields: event.fields,
      },
    });
  }
}
