import type { Request } from 'express';
import type { MemberActor } from '../../../../packages/contracts/src/core.js';

export abstract class ParticipantIdentity {
  abstract resolve(req: Request): Promise<MemberActor>;
  abstract resolveOptional(req: Request): Promise<MemberActor | null>;
}
