import type { MemberName } from '../../../../packages/contracts/src/members.js';
import type { Tx } from '../database/prisma.service.js';
import { normalizeName } from './member-matching.js';
export async function findCandidates(
  tx: Tx,
  organizationId: string,
  name: MemberName,
  birthDate: string,
  excludeId?: string,
) {
  if (!birthDate) return [];
  const normalized = normalizeName(name);
  return tx.member.findMany({
    where: {
      organizationId,
      deletedAt: null,
      normalizedFirstName: normalized.firstName,
      normalizedLastName: normalized.lastName,
      birthDate,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });
}

import type { Prisma } from '../generated/prisma/client.js';
import type { MembershipFilter } from '../../../../packages/contracts/src/memberships.js';
/** Shared search/filter conditions for the member list and exports. `today` is the Bangkok calendar date. */
export function memberWhere(organizationId: string, q: string, filter: MembershipFilter, today: string): Prisma.MemberWhereInput {
  const terms = q.trim().split(/\s+/).filter(Boolean);
  const digits = q.replace(/[\s()-]/g, '');
  const day = (offset: number) => new Date(new Date(`${today}T00:00:00.000Z`).getTime() + offset * 86400000);
  const and: Prisma.MemberWhereInput[] = [];
  if (q.trim())
    and.push({ OR: [
      { AND: terms.map((term) => ({ OR: [{ firstName: { contains: term } }, { lastName: { contains: term } }] })) },
      { phoneMobile: { contains: digits } },
      { memberNumber: { contains: q.trim(), mode: 'insensitive' as const } },
      { id: { startsWith: q.trim(), mode: 'insensitive' as const }, memberNumber: null },
    ] });
  if (filter.tier === 'general') and.push({ currentTierId: null });
  else if (filter.tier) and.push({ currentTierId: filter.tier });
  switch (filter.membership) {
    case 'general': and.push({ currentTierId: null }); break;
    case 'lifetime': and.push({ currentTierId: { not: null }, membershipExpiresAt: null }); break;
    case 'active': and.push({ currentTierId: { not: null }, OR: [{ membershipExpiresAt: null }, { membershipExpiresAt: { gte: day(0) } }] }); break;
    case 'expired': and.push({ currentTierId: { not: null }, membershipExpiresAt: { lt: day(0) } }); break;
    case 'expiring30': and.push({ membershipExpiresAt: { gte: day(0), lte: day(30) } }); break;
    default: break;
  }
  return { organizationId, deletedAt: null, ...(and.length ? { AND: and } : {}) };
}
