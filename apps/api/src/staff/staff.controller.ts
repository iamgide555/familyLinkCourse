import { validatedBody } from '../common/validation.js';
import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles, type StaffRequest } from '../auth/auth.guard.js';
import { StaffService } from './staff.service.js';
import { CreateStaffInput, UpdateStaffInput } from './staff.dto.js';
@Roles('admin')
@Controller('staff')
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}
  @Get() list(@Req() req: StaffRequest) {
    return this.staff.list(req.actor);
  }
  @Post() create(
    @Req() req: StaffRequest,
    @Body(validatedBody(CreateStaffInput)) input: CreateStaffInput,
  ) {
    return this.staff.create(req.actor, input);
  }
  @Patch(':id') update(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body(validatedBody(UpdateStaffInput)) input: UpdateStaffInput,
  ) {
    return this.staff.update(req.actor, id, input);
  }
}
