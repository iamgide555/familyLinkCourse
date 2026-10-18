import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public, Roles, type StaffRequest } from '../auth/auth.guard.js';
import { ParticipantIdentity } from '../identity/identity.service.js';
import { Linking } from '../linking/line-linking.service.js';
import { ProfileChanges } from './profile-changes.service.js';

@Controller('member')
export class ParticipantProfileController {
  constructor(
    @Inject(ParticipantIdentity) private readonly identity: ParticipantIdentity,
    @Inject(ProfileChanges) private readonly changes: ProfileChanges,
    @Inject(Linking) private readonly linking: Linking,
  ) {}
  @Public() @Post('link') @HttpCode(200)
  async link(@Req() req: Request, @Body() body: { token: string }) {
    return this.linking.redeem(await this.identity.resolve(req), body?.token);
  }
  @Public() @Post('me/:memberId/profile-changes')
  async submit(@Req() req: Request, @Param('memberId') memberId: string, @Body() body: Record<string, unknown>) {
    return this.changes.submit(await this.identity.resolve(req), memberId, body);
  }
  @Public() @Get('me/:memberId/profile-changes')
  async list(@Req() req: Request, @Param('memberId') memberId: string) {
    return this.changes.listForMember(await this.identity.resolve(req), memberId);
  }
  @Public() @Post('me/:memberId/remove') @HttpCode(200)
  async remove(@Req() req: Request, @Param('memberId') memberId: string) {
    return this.linking.removeOwn(await this.identity.resolve(req), memberId);
  }
}

@Roles('admin', 'staff')
@Controller()
export class StaffReviewController {
  constructor(
    @Inject(ProfileChanges) private readonly changes: ProfileChanges,
    @Inject(Linking) private readonly linking: Linking,
  ) {}
  @Get('reviews/summary') summary(@Req() req: StaffRequest) { return this.changes.summary(req.actor); }
  @Get('member/profile-changes') queue(@Req() req: StaffRequest) { return this.changes.queue(req.actor); }
  @Post('member/profile-changes/:id/decision') @HttpCode(200)
  decide(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { approve: boolean }) {
    return this.changes.review(req.actor, id, body?.approve);
  }
  @Post('members/:id/unlink') @HttpCode(200)
  unlink(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.linking.unlink(req.actor, id, body?.reason);
  }
}
