import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Roles, type StaffRequest } from '../auth/auth.guard.js';
import { validatedBody } from '../common/validation.js';
import { AppError } from '../common/errors.js';
import { Members } from './members.service.js';
import { StaffIntakeDto } from './members.dto.js';
@Roles('admin', 'staff')
@Controller('members')
export class MembersController {
  constructor(@Inject(Members) private readonly members: Members) {}
  @Get() list(@Req() req: StaffRequest, @Query() query: Record<string, unknown>) {
    const allowed = ['q', 'page', 'tier', 'membership'];
    if (
      Object.keys(query).some((key) => !allowed.includes(key)) ||
      Object.values(query).some((value) => value !== undefined && typeof value !== 'string') ||
      (query['membership'] !== undefined && !['active', 'expired', 'expiring30', 'lifetime', 'general', ''].includes(query['membership'] as string))
    )
      throw new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบคำค้นหา');
    return this.members.list(req.actor, (query['q'] as string) ?? '', Number(query['page'] ?? '1'), {
      ...(query['tier'] ? { tier: query['tier'] as string } : {}),
      ...(query['membership'] ? { membership: query['membership'] as 'active' } : {}),
    });
  }
  @Post('matches') @HttpCode(200) matches(
    @Req() req: StaffRequest,
    @Body(validatedBody(StaffIntakeDto)) input: StaffIntakeDto,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.members.matches(req.actor, input, excludeId);
  }
  @Get(':id') get(@Req() req: StaffRequest, @Param('id') id: string) {
    return this.members.get(req.actor, id);
  }
  @Post() create(
    @Req() req: StaffRequest,
    @Body(validatedBody(StaffIntakeDto)) input: StaffIntakeDto,
  ) {
    return this.members.save(req.actor, input);
  }
  @Patch(':id') update(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body(validatedBody(StaffIntakeDto)) input: StaffIntakeDto,
  ) {
    return this.members.save(req.actor, input, id);
  }
}
