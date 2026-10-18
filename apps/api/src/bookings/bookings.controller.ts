import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public, Roles, type StaffRequest } from '../auth/auth.guard.js';
import { ParticipantIdentity } from '../identity/identity.service.js';
import { Bookings } from './bookings.service.js';
import { Registrations } from './registrations.service.js';
import { Walkins } from './walkins.service.js';
import type { WalkinInput } from '../../../../packages/contracts/src/bookings.js';
import type { Answers } from '../../../../packages/contracts/src/questions.js';

type Register = { memberId: string; sessionIds?: string[]; answers?: Answers; operationKey: string };

@Roles('admin', 'staff')
@Controller()
export class StaffBookingsController {
  constructor(
    @Inject(Bookings) private readonly bookings: Bookings,
    @Inject(Registrations) private readonly registrations: Registrations,
    @Inject(Walkins) private readonly walkins: Walkins,
  ) {}
  @Get('runs/:id/registrations') forRun(@Req() req: StaffRequest, @Param('id') id: string) { return this.registrations.forRun(req.actor, id); }
  @Post('runs/:id/registrations') register(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: Register) {
    return this.bookings.register(req.actor, { runId: id, memberId: body?.memberId, sessionIds: body?.sessionIds ?? [], answers: body?.answers ?? {}, operationKey: body?.operationKey });
  }
  @Post('runs/:id/walkins') walkin(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: Omit<WalkinInput, 'runId'>) {
    return this.walkins.admit(req.actor, { ...body, runId: id });
  }
  @Get('members/:id/registrations') forMember(@Req() req: StaffRequest, @Param('id') id: string) { return this.registrations.forMember(req.actor, id); }
  @Get('registrations/:id') detail(@Req() req: StaffRequest, @Param('id') id: string) { return this.registrations.detail(req.actor, id); }
  @Post('registrations/:id/review') @HttpCode(200) review(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { sessionIds?: string[]; approve: boolean }) {
    return this.bookings.review(req.actor, id, body?.sessionIds ?? [], body?.approve);
  }
  @Post('registrations/:id/cancel') @HttpCode(200) cancel(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { sessionIds?: string[]; reason: string; operationKey: string }) {
    return this.bookings.cancel(req.actor, { registrationId: id, sessionIds: body?.sessionIds ?? [], reason: body?.reason, operationKey: body?.operationKey });
  }
  @Post('registrations/:id/promote') @HttpCode(200) promote(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: { sessionId?: string | null; reason: string }) {
    return this.bookings.promoteManually(req.actor, id, body?.sessionId ?? null, body?.reason);
  }
}

@Controller('member')
export class MemberBookingsController {
  constructor(
    @Inject(Bookings) private readonly bookings: Bookings,
    @Inject(Registrations) private readonly registrations: Registrations,
    @Inject(ParticipantIdentity) private readonly identity: ParticipantIdentity,
  ) {}
  @Public() @Get('courses') async courses(@Req() req: Request) { return this.registrations.courses(await this.identity.resolve(req)); }
  @Public() @Get('courses/:runId') async course(@Req() req: Request, @Param('runId') runId: string, @Query('memberId') memberId?: string) {
    return this.registrations.course(await this.identity.resolve(req), runId, memberId || null);
  }
  @Public() @Get('registrations') async mine(@Req() req: Request) { return this.registrations.mine(await this.identity.resolve(req)); }
  @Public() @Post('me/:memberId/registrations') async register(@Req() req: Request, @Param('memberId') memberId: string, @Body() body: { runId: string; sessionIds?: string[]; answers?: Answers; operationKey: string }) {
    return this.bookings.register(await this.identity.resolve(req), { runId: body?.runId, memberId, sessionIds: body?.sessionIds ?? [], answers: body?.answers ?? {}, operationKey: body?.operationKey });
  }
  @Public() @Post('registrations/:id/cancel') @HttpCode(200) async cancel(@Req() req: Request, @Param('id') id: string, @Body() body: { sessionIds?: string[]; operationKey: string }) {
    return this.bookings.cancel(await this.identity.resolve(req), { registrationId: id, sessionIds: body?.sessionIds ?? [], reason: 'member', operationKey: body?.operationKey });
  }
}
