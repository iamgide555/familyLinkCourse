import { Body, Controller, Delete, Get, Header, Headers, Inject, Param, Post, Req, Res, StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public, Roles, type StaffRequest } from '../auth/auth.guard.js';
import { AppError } from '../common/errors.js';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { ParticipantIdentity } from '../identity/identity.service.js';
import type { ConsentInput, SignupContext } from '../../../../packages/contracts/src/signup.js';
import { Documents } from './documents.service.js';

@Controller('member/documents')
export class MemberDocumentsController {
  constructor(
    @Inject(Documents) private readonly documents: Documents,
    @Inject(ParticipantIdentity) private readonly identity: ParticipantIdentity,
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig,
  ) {}
  private async context(req: Request, inviteToken: unknown): Promise<SignupContext> {
    const token = typeof inviteToken === 'string' && inviteToken ? inviteToken : undefined;
    const actor = await this.identity.resolveOptional(req);
    if (actor) return { kind: 'line', actor, ...(token ? { inviteToken: token } : {}) };
    if (!token) throw new AppError(401, 'INVITE_REQUIRED', 'กรุณาใช้ลิงก์สมัครสมาชิก');
    return { kind: 'invite', organizationId: this.config.organizationId, inviteToken: token };
  }
  @Public() @Post('drafts')
  async begin(@Req() req: Request, @Body() body: { inviteToken?: string }) {
    return this.documents.beginDraft(await this.context(req, body?.inviteToken));
  }
  @Public() @Post('drafts/:id/consent')
  async consent(@Req() req: Request, @Param('id') id: string, @Body() body: { draftToken: string; inviteToken?: string; consent: ConsentInput }) {
    await this.documents.grantUploadConsent(await this.context(req, body?.inviteToken), id, body?.draftToken, body?.consent);
    return { granted: true };
  }
  @Public() @Post('drafts/:id/files')
  async upload(@Req() req: Request, @Param('id') id: string, @Headers('x-draft-token') draftToken: string, @Headers('x-invite-token') inviteToken: string | undefined, @Headers('x-document-type-id') typeId: string | undefined) {
    return this.documents.uploadToDraft(await this.context(req, inviteToken), id, draftToken, typeId || null, req);
  }
}

@Roles('admin', 'staff')
@Controller()
export class StaffDocumentsController {
  constructor(@Inject(Documents) private readonly documents: Documents) {}
  @Get('members/:id/documents') list(@Req() req: StaffRequest, @Param('id') id: string) {
    return this.documents.listForMember(req.actor, id);
  }
  @Post('members/:id/documents') upload(@Req() req: StaffRequest, @Param('id') id: string, @Headers('x-document-kind') kind: string | undefined, @Headers('x-document-type-id') typeId: string | undefined, @Headers('x-paper-consent') paper: string | undefined) {
    const safeKind = kind === 'signed_form' ? 'signed_form' : 'document';
    return this.documents.uploadForMember(req.actor, id, safeKind, typeId || null, paper === 'confirmed', req);
  }
  @Get('documents/:id/content') @Header('Cache-Control', 'no-store') @Header('X-Content-Type-Options', 'nosniff')
  async content(@Req() req: StaffRequest, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { bytes, mime } = await this.documents.download(req.actor, id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline; filename="document"');
    return new StreamableFile(bytes);
  }
  @Post('documents/:id/verify') verify(@Req() req: StaffRequest, @Param('id') id: string) {
    return this.documents.verify(req.actor, id);
  }
  @Delete('documents/:id') remove(@Req() req: StaffRequest, @Param('id') id: string) {
    return this.documents.remove(req.actor, id);
  }
}
