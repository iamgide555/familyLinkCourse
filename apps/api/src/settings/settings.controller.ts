import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { Roles, type StaffRequest } from '../auth/auth.guard.js';
import { AppError } from '../common/errors.js';
import { Settings } from './settings.service.js';
import { OrgSettings } from './org-settings.service.js';

function validBody(body: unknown, keys: string[]): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !keys.includes(key)))
    throw new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบข้อมูล');
  return body as Record<string, unknown>;
}
@Roles('admin', 'staff')
@Controller('settings')
export class SettingsController {
  constructor(@Inject(Settings) private readonly settings: Settings, @Inject(OrgSettings) private readonly org: OrgSettings) {}
  @Get('organization') organization(@Req() req: StaffRequest) { return this.org.get(req.actor.organizationId); }
  @Roles('admin') @Patch('organization') updateOrganization(@Req() req: StaffRequest, @Body() input: unknown) { return this.org.update(req.actor, input as never); }
  @Get('service-types') services(@Req() req: StaffRequest) { return this.settings.serviceTypes(req.actor); }
  @Get('document-types') documents(@Req() req: StaffRequest) { return this.settings.documentTypes(req.actor); }
  @Roles('admin') @Post('service-types') createService(@Req() req: StaffRequest, @Body() input: unknown) {
    return this.settings.create(req.actor, 'service', validBody(input, ['name'])['name']);
  }
  @Roles('admin') @Post('document-types') createDocument(@Req() req: StaffRequest, @Body() input: unknown) {
    return this.settings.create(req.actor, 'document', validBody(input, ['name'])['name']);
  }
  @Roles('admin') @Patch('service-types/:id') updateService(@Req() req: StaffRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.settings.update(req.actor, 'service', id, validBody(input, ['name', 'active']));
  }
  @Roles('admin') @Patch('document-types/:id') updateDocument(@Req() req: StaffRequest, @Param('id') id: string, @Body() input: unknown) {
    return this.settings.update(req.actor, 'document', id, validBody(input, ['name', 'active']));
  }
}
