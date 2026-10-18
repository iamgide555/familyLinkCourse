import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles, type StaffRequest } from '../auth/auth.guard.js';
import { AppError } from '../common/errors.js';
import { MemberAdmin } from './member-admin.service.js';

function fields(input: unknown, allowed: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key)))
    throw new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบข้อมูล');
  return input as Record<string, unknown>;
}
@Roles('admin')
@Controller('members')
export class MemberAdminController {
  constructor(@Inject(MemberAdmin) private readonly admin: MemberAdmin) {}
  @Delete(':id') delete(@Req() req: StaffRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.admin.deleteMember(req.actor, id, fields(input, ['reason'])['reason']);
  }
  @Get(':id/pdpa-requests') list(@Req() req: StaffRequest, @Param('id') id: string) {
    return this.admin.listRequests(req.actor, id);
  }
  @Post(':id/pdpa-requests') open(@Req() req: StaffRequest, @Param('id') id: string, @Body() input: unknown) {
    const body = fields(input, ['kind', 'reason']);
    return this.admin.openRequest(req.actor, id, body['kind'], body['reason']);
  }
  @Patch(':id/pdpa-requests/:requestId') resolve(@Req() req: StaffRequest, @Param('id') id: string, @Param('requestId') requestId: string, @Body() input: unknown) {
    const body = fields(input, ['status', 'note']);
    return this.admin.resolveRequest(req.actor, id, requestId, body['status'], body['note']);
  }
}
