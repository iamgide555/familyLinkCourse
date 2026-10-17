import {
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { StaffActor, Role } from '../../../../packages/contracts/src/core.js';
import { SessionService } from './session.service.js';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { AppError } from '../common/errors.js';
export const Public = () => SetMetadata('publicRoute', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export type StaffRequest = Request & { actor: StaffActor; sessionToken: string };
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<StaffRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    if (
      this.reflector.getAllAndOverride<boolean>('publicRoute', [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        req.headers.origin &&
        req.headers.origin !== this.config.webOrigin
      )
        throw new AppError(
          403,
          'ORIGIN_REJECTED',
          'ไม่สามารถทำรายการจากหน้านี้ได้ กรุณาเปิดเว็บไซต์ FamilyLink',
        );
      return true;
    }
    const token = req.cookies?.[this.sessions.cookieName] as string | undefined;
    const actor = token ? await this.sessions.resolve(token) : null;
    if (!actor || !token)
      throw new AppError(401, 'UNAUTHENTICATED', 'หมดเวลาใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (
        (req.headers.origin && req.headers.origin !== this.config.webOrigin) ||
        !this.sessions.validCsrf(token, req.headers['x-csrf-token'])
      )
        throw new AppError(
          403,
          'CSRF_REJECTED',
          'หน้านี้หมดอายุแล้ว กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง',
        );
    }
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(actor.role))
      throw new AppError(403, 'FORBIDDEN', 'รายการนี้ต้องให้ผู้ดูแลระบบดำเนินการ');
    req.actor = actor;
    req.sessionToken = token;
    res.cookie(this.sessions.cookieName, token, {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: '/api',
      maxAge: 30 * 60 * 1000,
    });
    return true;
  }
}
