import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { Roles, type StaffRequest } from '../auth/auth.guard.js';
import { Questions } from '../questions/questions.service.js';
import { Courses } from './courses.service.js';
import type { CreateCourseInput, CreateRunInput, RunPatch, SessionInput, SessionPatch } from '../../../../packages/contracts/src/courses.js';
import type { QuestionInput } from '../../../../packages/contracts/src/questions.js';

@Roles('admin', 'staff')
@Controller()
export class CoursesController {
  constructor(
    @Inject(Courses) private readonly courses: Courses,
    @Inject(Questions) private readonly questions: Questions,
  ) {}
  @Get('courses') list(@Req() req: StaffRequest) { return this.courses.listCourses(req.actor); }
  @Post('courses') create(@Req() req: StaffRequest, @Body() body: CreateCourseInput) { return this.courses.createCourse(req.actor, body); }
  @Get('courses/:id') get(@Req() req: StaffRequest, @Param('id') id: string) { return this.courses.getCourse(req.actor, id); }
  @Patch('courses/:id') update(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { name?: string; description?: string; serviceTypeIds?: string[] }) { return this.courses.updateCourse(req.actor, id, body); }
  @Delete('courses/:id') remove(@Req() req: StaffRequest, @Param('id') id: string) { return this.courses.deleteCourse(req.actor, id); }
  @Put('courses/:id/questions') courseQuestions(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { questions: QuestionInput[] }) { return this.questions.replaceCourse(req.actor, id, body?.questions); }
  @Post('courses/:id/runs') createRun(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: CreateRunInput) { return this.courses.createRun(req.actor, id, body); }

  @Get('runs/:id') run(@Req() req: StaffRequest, @Param('id') id: string) { return this.courses.getRun(req.actor, id); }
  @Patch('runs/:id') updateRun(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: RunPatch) { return this.courses.updateRun(req.actor, id, body); }
  @Delete('runs/:id') removeRun(@Req() req: StaffRequest, @Param('id') id: string) { return this.courses.deleteRun(req.actor, id); }
  @Put('runs/:id/questions') runQuestions(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { questions: QuestionInput[] }) { return this.courses.replaceRunQuestions(req.actor, id, body?.questions); }
  @Post('runs/:id/sessions') addSession(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: SessionInput) { return this.courses.addSession(req.actor, id, body); }
  @Post('runs/:id/cancel') @HttpCode(200) cancelRun(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { reason: string }) { return this.courses.cancelRun(req.actor, id, body?.reason); }

  @Patch('sessions/:id') updateSession(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: SessionPatch) { return this.courses.updateSession(req.actor, id, body); }
  @Delete('sessions/:id') removeSession(@Req() req: StaffRequest, @Param('id') id: string) { return this.courses.deleteSession(req.actor, id); }
  @Post('sessions/:id/reschedule') @HttpCode(200) reschedule(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { date: string; startTime: string; endTime: string }) { return this.courses.reschedule(req.actor, id, body); }
  @Post('sessions/:id/cancel') @HttpCode(200) cancelSession(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { reason: string }) { return this.courses.cancelSession(req.actor, id, body?.reason); }

  @Get('question-library') library(@Req() req: StaffRequest) { return this.questions.library(req.actor); }
  @Post('question-library') createLibrary(@Req() req: StaffRequest, @Body() body: QuestionInput) { return this.questions.createLibrary(req.actor, body); }
  @Patch('question-library/:id') updateLibrary(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { label?: string; active?: boolean }) { return this.questions.updateLibrary(req.actor, id, body); }
}
