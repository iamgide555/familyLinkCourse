import { hash } from 'argon2';
import { isEmail } from 'class-validator';
import type { PrismaService } from '../database/prisma.service.js';
export type BootstrapAdminInput = { email: string; name: string; password: string };
export async function bootstrapAdmin(
  db: PrismaService,
  organizationId: string,
  input: BootstrapAdminInput,
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (
    !isEmail(email) ||
    !input.name.trim() ||
    input.password.length < 12 ||
    input.password.length > 256
  )
    throw new Error('Explicit admin name, email and password of at least 12 characters required');
  const passwordHash = await hash(input.password);
  await db.$transaction(async (tx) => {
    await tx.organization.upsert({
      where: { id: organizationId },
      create: { id: organizationId, name: 'FamilyLink' },
      update: {},
    });
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;
    if (await tx.user.count({ where: { organizationId, role: 'admin', active: true } }))
      throw new Error('An active admin already exists; use account management instead');
    if (await tx.user.findUnique({ where: { organizationId_email: { organizationId, email } } }))
      throw new Error('Staff account already exists');
    await tx.user.create({
      data: { organizationId, email, name: input.name.trim(), passwordHash, role: 'admin' },
    });
  });
}
