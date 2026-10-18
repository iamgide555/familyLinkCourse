import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { StaffRequest } from '../auth/auth.guard.js';
import { Public } from '../auth/auth.guard.js';
import { AppError } from '../common/errors.js';
import { ParticipantIdentity } from '../identity/identity.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { Members } from '../members/members.service.js';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { ReferenceData } from '../members/reference-data.service.js';
import { Invites } from './invites.service.js';
import { OrgSettings } from '../settings/org-settings.service.js';
import { Signup } from './signup.service.js';
import type { InvitePrefill, SignupDecision, SignupInput } from '../../../../packages/contracts/src/signup.js';

@Controller('member/invites')
export class InvitesController {
  constructor(@Inject(Invites) private readonly invites: Invites) {}
  @Post()
  issue(@Req() req: StaffRequest, @Body() body: { mode: 'signup'|'link'; memberId?: string; prefill?: InvitePrefill }) {
    if (Object.keys(body).some((key) => !['mode','memberId','prefill'].includes(key))) throw new AppError(422, 'INVALID_INPUT', 'ข้อมูลลิงก์ไม่ถูกต้อง');
    return this.invites.issue(req.actor, body.mode, body.memberId ?? null, body.prefill ?? {});
  }
  @Public() @Get(':token/context')
  context(@Param('token') token: string) { return this.invites.context(token); }
}

@Controller('member')
export class SignupController {
  constructor(
    @Inject(Signup) private readonly signup: Signup,
    @Inject(ParticipantIdentity) private readonly identity: ParticipantIdentity,
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Members) private readonly members: Members,
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig,
    @Inject(ReferenceData) private readonly references: ReferenceData,
    @Inject(OrgSettings) private readonly orgSettings: OrgSettings,
  ) {}
  /** Public, non-secret client configuration: the LIFF app id, and whether the development identity picker applies. */
  @Public() @Get('config')
  clientConfig() { return { liffId: this.config.line?.liffId ?? null, devIdentity: !this.config.production && !!this.config.devIdentityEnabled }; }
  @Public() @Get('signup/options')
  async options() {
    const [services, documentTypes] = await Promise.all([
      this.db.serviceType.findMany({ where: { organizationId: this.config.organizationId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.db.documentType.findMany({ where: { organizationId: this.config.organizationId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const consents = (await this.orgSettings.get(this.config.organizationId)).consents;
    return { provinces: this.references.provinces(), services, documentTypes, consentTexts: consents, consentVersions: Object.fromEntries(Object.entries(consents).map(([k, v]) => [k, v.version])) };
  }
  @Public() @Get('signup/districts/:provinceId')
  districts(@Param('provinceId') provinceId: string) { return { districts: this.references.districts(provinceId) }; }
  @Public() @Post('signup')
  async submit(@Req() req: Request, @Body() raw: SignupInput & { inviteToken?: string }) {
    const actor = await this.identity.resolveOptional(req);
    const context = actor
      ? { kind: 'line' as const, actor, ...(raw.inviteToken ? { inviteToken: raw.inviteToken } : {}) }
      : { kind: 'invite' as const, organizationId: this.config.organizationId, inviteToken: raw.inviteToken ?? '' };
    return this.signup.submit(context, raw, Object.keys(raw));
  }
  @Public() @Get('me')
  async me(@Req() req: Request) {
    const actor = await this.identity.resolve(req);
    const members = await this.db.member.findMany({ where: { organizationId: actor.organizationId, lineAccountId: actor.lineAccountId, deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    return { members: await Promise.all(members.map((member) => this.members.getParticipantView(actor, member.id))), pending: await this.signup.pending(actor) };
  }
  @Public() @Get('me/:memberId')
  async profile(@Req() req: Request, @Param('memberId') memberId: string) {
    const actor = await this.identity.resolve(req);
    return this.members.getParticipantView(actor, memberId);
  }
}

@Controller('member/reviews')
export class SignupReviewsController {
  constructor(@Inject(Signup) private readonly signup: Signup) {}
  @Get() queue(@Req() req: StaffRequest) { return this.signup.queue(req.actor); }
  @Post(':requestId/decision')
  decide(@Req() req: StaffRequest, @Param('requestId') requestId: string, @Body() body: SignupDecision) {
    return this.signup.review(req.actor, requestId, body);
  }
}
