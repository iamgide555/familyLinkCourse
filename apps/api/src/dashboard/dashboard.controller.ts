import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { Roles, type StaffRequest } from '../auth/auth.guard.js';
import { Dashboard } from './dashboard.service.js';

@Roles('admin', 'staff')
@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(Dashboard) private readonly dashboard: Dashboard) {}
  @Get() summary(@Req() req: StaffRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboard.summary(req.actor, { ...(from ? { from } : {}), ...(to ? { to } : {}) });
  }
}
