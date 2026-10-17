import { validatedBody } from '../common/validation.js';
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginInput } from './auth.dto.js';
import { SessionService } from './session.service.js';
import { Public, type StaffRequest } from './auth.guard.js';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig,
  ) {}
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(validatedBody(LoginInput)) input: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.sessions.login(
      input.email,
      input.password,
      req.ip ?? 'unknown',
    );
    res.cookie(this.sessions.cookieName, token, {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: '/api',
      maxAge: 30 * 60 * 1000,
    });
    return { user, csrfToken: this.sessions.csrf(token) };
  }
  @Get('session') async session(@Req() req: StaffRequest) {
    return {
      user: await this.sessions.user(req.actor),
      csrfToken: this.sessions.csrf(req.sessionToken),
    };
  }
  @Post('logout') @HttpCode(200) async logout(
    @Req() req: StaffRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.sessions.logout(req.sessionToken);
    res.clearCookie(this.sessions.cookieName, {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: '/api',
    });
    return { ok: true };
  }
}
