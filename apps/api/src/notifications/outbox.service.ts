import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../../packages/contracts/src/core.js';
import type { NotificationEvent } from '../../../../packages/contracts/src/notifications.js';
import type { Tx } from '../database/prisma.service.js';
import { AppError } from '../common/errors.js';

@Injectable()
export class Outbox {
  async enqueue(tx: Tx, actor: Actor, event: NotificationEvent): Promise<void> {
    const recipientId = event.recipient.kind === 'member'
      ? event.recipient.memberId : event.recipient.requestId;
    if (!/^[0-9a-f-]{36}$/i.test(event.eventId) || !/^[0-9a-f-]{36}$/i.test(recipientId) ||
        Object.values(event.entityRefs).some((ids) => !Array.isArray(ids) || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))))
      throw new AppError(422, 'INVALID_NOTIFICATION_EVENT', 'รายการแจ้งเตือนไม่ถูกต้อง');
    await tx.notification.createMany({
      data: [{
        organizationId: actor.organizationId,
        eventId: event.eventId,
        kind: event.kind,
        recipientKind: event.recipient.kind,
        recipientId,
        entityRefs: event.entityRefs,
        dedupeKey: `${event.eventId}:pending`,
      }],
      skipDuplicates: true,
    });
  }
}
