import { Inject, Injectable } from '@nestjs/common';
import type { Answers, QuestionDefinition } from '../../../../packages/contracts/src/questions.js';
import type { SnapshotView } from '../../../../packages/contracts/src/bookings.js';
import { FieldCrypto, type EncryptedValue } from '../crypto/field-crypto.js';
import type { Tx } from '../database/prisma.service.js';
import { Members } from '../members/members.service.js';

export type SnapshotBody = { member: Record<string, unknown>; questions: QuestionDefinition[]; answers: Answers };
/** Immutable submission history: member details, question wording and answers, encrypted as one record. */
@Injectable()
export class Snapshots {
  constructor(
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Members) private readonly members: Members,
  ) {}
  async create(tx: Tx, organizationId: string, registrationId: string, memberId: string, questions: QuestionDefinition[], answers: Answers, createdBy: string): Promise<{ id: string; version: number }> {
    const last = await tx.registrationSnapshot.aggregate({ where: { organizationId, registrationId }, _max: { version: true } });
    const version = (last._max.version ?? 0) + 1;
    const member = (await this.members.snapshotDetails(tx, organizationId, memberId)) as unknown as Record<string, unknown>;
    const body: SnapshotBody = { member, questions, answers };
    const row = await tx.registrationSnapshot.create({ data: { organizationId, registrationId, version, createdBy, snapshotEncrypted: this.crypto.encrypt(JSON.stringify(body)) } });
    return { id: row.id, version };
  }
  read(row: { snapshotEncrypted: unknown }): SnapshotBody {
    return JSON.parse(this.crypto.decrypt(row.snapshotEncrypted as EncryptedValue)) as SnapshotBody;
  }
  view(row: { version: number; createdAt: Date; createdBy: string; snapshotEncrypted: unknown }): SnapshotView {
    const body = this.read(row);
    return { version: row.version, createdAt: row.createdAt.toISOString(), createdBy: row.createdBy, ...body };
  }
}
