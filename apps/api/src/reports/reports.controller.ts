import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles, type StaffRequest } from '../auth/auth.guard.js';
import { AppError } from '../common/errors.js';
import { Reports } from './reports.service.js';

@Roles('admin', 'staff')
@Controller('reports')
export class ReportsController {
  constructor(@Inject(Reports) private readonly reports: Reports) {}
  /** Once bytes are flowing the status cannot change, so a late failure is logged without data and the stream is cut. */
  private async stream(res: Response, task: () => Promise<void>): Promise<void> {
    try { await task(); } catch (error) {
      if (!res.headersSent) throw error;
      console.error('Export stream failed:', error instanceof Error ? error.message : 'unknown error');
      res.destroy();
    }
  }
  @Get('members.xlsx')
  async members(@Req() req: StaffRequest, @Res() res: Response, @Query() query: Record<string, string>) {
    if (Object.keys(query).some((k) => !['q', 'tier', 'membership', 'sensitive'].includes(k)) || (query['membership'] && !['active', 'expired', 'expiring30', 'lifetime', 'general'].includes(query['membership'])))
      throw new AppError(422, 'INVALID_INPUT', 'ตัวกรองไม่ถูกต้อง');
    await this.stream(res, () => this.reports.exportMembers(req.actor, query['q'] ?? '', { ...(query['tier'] ? { tier: query['tier'] } : {}), ...(query['membership'] ? { membership: query['membership'] as 'active' } : {}) }, query['sensitive'] === '1', res));
  }
  @Get('runs/:id.xlsx')
  async run(@Req() req: StaffRequest, @Res() res: Response, @Param('id') id: string, @Query('sensitive') sensitive?: string) {
    await this.stream(res, () => this.reports.exportRun(req.actor, id.replace(/\.xlsx$/, ''), sensitive === '1', res));
  }
}
