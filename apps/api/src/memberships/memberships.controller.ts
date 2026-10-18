import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Roles, type StaffRequest } from '../auth/auth.guard.js';
import { AppError } from '../common/errors.js';
import { isDate } from '../common/bangkok.js';
import { Memberships } from './memberships.service.js';
import type { PaymentCorrection, PaymentInput, TierInput } from '../../../../packages/contracts/src/memberships.js';

@Roles('admin', 'staff')
@Controller()
export class MembershipsController {
  constructor(@Inject(Memberships) private readonly memberships: Memberships) {}
  @Get('membership-tiers') tiers(@Req() req: StaffRequest) { return this.memberships.tiers(req.actor); }
  @Post('membership-tiers') createTier(@Req() req: StaffRequest, @Body() body: TierInput) { return this.memberships.createTier(req.actor, body); }
  @Patch('membership-tiers/:id') updateTier(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: Partial<TierInput>) { return this.memberships.updateTier(req.actor, id, body); }
  @Get('members/:id/memberships') history(@Req() req: StaffRequest, @Param('id') id: string) { return this.memberships.history(req.actor, id); }
  @Post('members/:id/memberships') record(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: PaymentInput) { return this.memberships.record(req.actor, id, body); }
  @Patch('memberships/:id') correct(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: PaymentCorrection) { return this.memberships.correct(req.actor, id, body); }
  @Post('memberships/:id/void') @HttpCode(200) void_(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { reason: string }) { return this.memberships.void(req.actor, id, body?.reason); }
  @Get('reports/membership-fees') fees(@Req() req: StaffRequest, @Query('from') from?: string, @Query('to') to?: string) {
    if ((from && !isDate(from)) || (to && !isDate(to))) throw new AppError(422, 'INVALID_INPUT', 'กรุณาระบุช่วงวันที่ให้ถูกต้อง');
    return this.memberships.monthlyFees(req.actor, from, to);
  }
}
