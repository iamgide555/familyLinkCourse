import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { Roles, type StaffRequest } from '../auth/auth.guard.js';
import { AppError } from '../common/errors.js';
import { isDate } from '../common/bangkok.js';
import { Attendance } from './attendance.service.js';
import type { AttendanceStatus } from '../../../../packages/contracts/src/attendance.js';

@Roles('admin', 'staff')
@Controller()
export class AttendanceController {
  constructor(@Inject(Attendance) private readonly attendance: Attendance) {}
  @Get('attendance/sessions') sessions(@Req() req: StaffRequest, @Query('date') date: string) {
    if (!isDate(date)) throw new AppError(422, 'INVALID_INPUT', 'กรุณาระบุวันที่');
    return this.attendance.sessionsOn(req.actor, date);
  }
  @Get('sessions/:id/roster') roster(@Req() req: StaffRequest, @Param('id') id: string) { return this.attendance.roster(req.actor, id); }
  @Post('sessions/:id/attendance') @HttpCode(200) mark(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { memberId: string; status: AttendanceStatus }) {
    return this.attendance.mark(req.actor, id, body?.memberId, body?.status);
  }
  @Delete('sessions/:id/attendance/:memberId') clear(@Req() req: StaffRequest, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.attendance.clear(req.actor, id, memberId);
  }
}
