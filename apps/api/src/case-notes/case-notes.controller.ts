import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Roles, type StaffRequest } from '../auth/auth.guard.js';
import { validatedBody } from '../common/validation.js';
import { CaseNotes } from './case-notes.service.js';
import { CaseNoteBodyDto } from './case-notes.dto.js';

@Roles('admin', 'staff')
@Controller()
export class CaseNotesController {
  constructor(@Inject(CaseNotes) private readonly notes: CaseNotes) {}

  @Post('members/:memberId/case-notes')
  create(
    @Req() req: StaffRequest,
    @Param('memberId') memberId: string,
    @Body(validatedBody(CaseNoteBodyDto)) input: CaseNoteBodyDto,
  ) {
    return this.notes.create(req.actor, memberId, input.body);
  }

  @Get('members/:memberId/case-notes')
  list(@Req() req: StaffRequest, @Param('memberId') memberId: string) {
    return this.notes.list(req.actor, memberId);
  }

  @Patch('case-notes/:id')
  edit(
    @Req() req: StaffRequest,
    @Param('id') id: string,
    @Body(validatedBody(CaseNoteBodyDto)) input: CaseNoteBodyDto,
  ) {
    return this.notes.edit(req.actor, id, input.body);
  }

  @Get('case-notes/:id/history')
  history(@Req() req: StaffRequest, @Param('id') id: string) {
    return this.notes.history(req.actor, id);
  }

  @Roles('admin')
  @Delete('case-notes/:id')
  @HttpCode(204)
  delete(@Req() req: StaffRequest, @Param('id') id: string) {
    return this.notes.delete(req.actor, id);
  }
}
