import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from 'argon2';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { PrismaService } from '../database/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import type { StaffActor, StaffUser } from '../../../../packages/contracts/src/core.js';
const IDLE_MS = 30 * 60 * 1000;
export function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'staff';
  active: boolean;
  memberId: string | null;
}): StaffUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    memberId: user.memberId,
  };
}
@Injectable()
export class SessionService {
  private readonly failures = new Map<string, { count: number; expires: number }>();
  private readonly dummyHash = hash(randomBytes(32));
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig,
    @Inject(Clock) private readonly clock: Clock,
  ) {}
  get cookieName(): string {
    return this.config.production ? '__Secure-fl_session' : 'fl_session';
  }
  tokenHash(token: string): string {
    return createHmac('sha256', this.config.sessionSecret)
      .update('session:' + token)
      .digest('hex');
  }
  csrf(token: string): string {
    return createHmac('sha256', this.config.sessionSecret)
      .update('csrf:' + token)
      .digest('base64url');
  }
  validCsrf(token: string, provided: unknown): boolean {
    if (typeof provided !== 'string') return false;
    const expected = Buffer.from(this.csrf(token));
    const actual = Buffer.from(provided);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  async login(
    email: string,
    password: string,
    ip: string,
  ): Promise<{ token: string; user: StaffUser }> {
    const rateKey = this.tokenHash(ip + '\0' + email);
    const now = this.clock.now();
    const previous = this.failures.get(rateKey);
    if (previous && previous.expires > now.getTime() && previous.count >= 5)
      throw new AppError(
        429,
        'LOGIN_RATE_LIMIT',
        'ลองเข้าสู่ระบบหลายครั้งแล้ว กรุณารอ 15 นาทีแล้วลองใหม่',
      );
    const entry =
      previous && previous.expires > now.getTime()
        ? previous
        : { count: 0, expires: now.getTime() + 15 * 60 * 1000 };
    entry.count++;
    this.failures.set(rateKey, entry);
    if (this.failures.size > 10000)
      for (const [key, value] of this.failures)
        if (value.expires <= now.getTime()) this.failures.delete(key);
    const user = await this.db.user.findUnique({
      where: { organizationId_email: { organizationId: this.config.organizationId, email } },
    });
    const matches = await verify(user?.passwordHash ?? (await this.dummyHash), password);
    if (!user || !user.active || !matches) {
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง',
      );
    }
    const result = await this.db.$transaction(async (tx) => {
      // Account security changes take the same lock before revoking sessions.
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${user.organizationId} FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { organizationId_id: { organizationId: user.organizationId, id: user.id } },
      });
      if (!current?.active || current.passwordHash !== user.passwordHash)
        throw new AppError(
          401,
          'INVALID_CREDENTIALS',
          'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง',
        );
      const token = randomBytes(32).toString('base64url');
      await tx.session.create({
        data: {
          organizationId: current.organizationId,
          userId: current.id,
          tokenHash: this.tokenHash(token),
          expiresAt: new Date(this.clock.now().getTime() + IDLE_MS),
        },
      });
      return { token, user: publicUser(current) };
    });
    this.failures.delete(rateKey);
    return result;
  }
  async resolve(token: string): Promise<StaffActor | null> {
    if (!token || token.length > 128) return null;
    const now = this.clock.now();
    const session = await this.db.session.findFirst({
      where: { organizationId: this.config.organizationId, tokenHash: this.tokenHash(token) },
      include: { user: true },
    });
    if (!session || !session.user.active || session.expiresAt <= now) return null;
    const updated = await this.db.session.updateMany({
      where: { id: session.id, organizationId: this.config.organizationId, expiresAt: { gt: now } },
      data: { expiresAt: new Date(now.getTime() + IDLE_MS) },
    });
    if (updated.count === 0) return null;
    return {
      kind: 'staff',
      organizationId: session.organizationId,
      userId: session.userId,
      role: session.user.role,
      memberId: session.user.memberId,
    };
  }
  async user(actor: StaffActor): Promise<StaffUser> {
    const user = await this.db.user.findUniqueOrThrow({
      where: { organizationId_id: { organizationId: actor.organizationId, id: actor.userId } },
    });
    return publicUser(user);
  }
  async logout(token: string): Promise<void> {
    await this.db.session.deleteMany({
      where: { organizationId: this.config.organizationId, tokenHash: this.tokenHash(token) },
    });
  }
}
