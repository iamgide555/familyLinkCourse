import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { Roles, type StaffRequest } from '../auth/auth.guard.js';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { PrismaService } from '../database/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';
import { FieldCrypto, type EncryptedValue } from '../crypto/field-crypto.js';
import { NotificationWorker } from './notification-worker.js';
import { SimulatedTransport } from './simulated.transport.js';
import { CallList } from './call-list.service.js';
import { KIND_WORD } from './kind-words.js';

@Roles('admin', 'staff')
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig,
    @Inject(NotificationWorker) private readonly worker: NotificationWorker,
    @Inject(SimulatedTransport) private readonly simulated: SimulatedTransport,
    @Inject(CallList) private readonly callList: CallList,
  ) {}
  @Get('summary')
  async summary(@Req() req: StaffRequest) {
    const org = req.actor.organizationId;
    const [followUp, queued, sentThisMonth, usage] = await Promise.all([
      this.db.notification.count({ where: { organizationId: org, status: { in: ['staff_followup', 'failed'] } } }),
      this.db.notification.count({ where: { organizationId: org, status: { in: ['queued', 'retry', 'sending'] } } }),
      this.db.notification.count({ where: { organizationId: org, status: 'sent' } }),
      this.worker.lineUsage(org),
    ]);
    // Live LINE quota is only visible to administrators.
    return { followUp, queued, sentThisMonth, delivery: this.config.staffOnly ? 'staff_only' : this.config.line ? 'live' : 'simulated', ...(req.actor.role === 'admin' ? { linePushThisMonth: usage, lineMonthlyQuota: this.config.line?.monthlyQuota ?? null } : {}) };
  }
  /** Notices staff must deliver by phone, grouped by course run, with the text to read out. */
  @Get('call-list')
  async calls(@Req() req: StaffRequest) {
    const groups = await this.callList.groups(req.actor.organizationId);
    await this.db.$transaction((tx) => this.audit.record(tx, req.actor, { action: 'notification.call_list', entity: 'notification', entityId: req.actor.userId, fields: ['fields'] }));
    return { groups };
  }
  @Get()
  async list(@Req() req: StaffRequest, @Query('status') status?: string) {
    const org = req.actor.organizationId;
    const where = status === 'all' ? { organizationId: org } : { organizationId: org, status: { in: ['staff_followup', 'failed'] } };
    const rows = await this.db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    const memberIds = rows.filter((r) => r.recipientKind === 'member').map((r) => r.recipientId);
    const members = await this.db.member.findMany({ where: { organizationId: org, id: { in: memberIds } }, select: { id: true, firstName: true, lastName: true, phoneMobile: true, email: true } });
    const byId = new Map(members.map((m) => [m.id, m]));
    const items = [];
    for (const r of rows) {
      let who = r.recipientKind === 'line_account' ? 'บัญชี LINE (หลายสมาชิก)' : 'ผู้สมัคร';
      let phone = '';
      if (r.recipientKind === 'member') { const m = byId.get(r.recipientId); who = m ? `${m.firstName} ${m.lastName}` : 'สมาชิกที่ถูกลบ'; phone = m?.phoneMobile ?? ''; }
      if (r.recipientKind === 'signup_request') { const q = await this.db.signupRequest.findFirst({ where: { organizationId: org, id: r.recipientId } }); if (q) { const d = JSON.parse(this.crypto.decrypt(q.submittedDataEncrypted as EncryptedValue)) as { firstName?: string; lastName?: string; phoneMobile?: string }; who = `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || who; phone = d.phoneMobile ?? ''; } }
      items.push({ id: r.id, kind: r.kind, kindWord: KIND_WORD[r.kind] ?? r.kind, status: r.status, channel: r.channel, attempts: r.attempts, lastErrorCode: r.lastErrorCode, createdAt: r.createdAt.toISOString(), sentAt: r.sentAt?.toISOString() ?? null, nextAttemptAt: r.nextAttemptAt?.toISOString() ?? null, recipient: who, phone, targetDate: r.targetDate });
    }
    await this.db.$transaction((tx) => this.audit.record(tx, req.actor, { action: 'notification.list', entity: 'notification', entityId: req.actor.userId, fields: ['fields'] }));
    return { items };
  }
  /** Staff who handled a failed notice by phone mark it done. */
  @Post(':id/resolve') @HttpCode(200)
  async resolve(@Req() req: StaffRequest, @Param('id') id: string) {
    const done = await this.db.notification.updateMany({ where: { organizationId: req.actor.organizationId, id, status: { in: ['staff_followup', 'failed'] } }, data: { status: 'resolved', lastErrorCode: 'resolved_by_staff' } });
    if (!done.count) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรายการที่ต้องติดตาม');
    await this.db.$transaction((tx) => this.audit.record(tx, req.actor, { action: 'notification.resolve', entity: 'notification', entityId: id, fields: ['status'] }));
    return { id, status: 'resolved' };
  }
  /** Try the automatic sending again, for example after the member's email was corrected. */
  @Post(':id/retry') @HttpCode(200)
  async retry(@Req() req: StaffRequest, @Param('id') id: string) {
    const n = await this.db.notification.findFirst({ where: { organizationId: req.actor.organizationId, id, status: { in: ['staff_followup', 'failed'] } } });
    if (!n) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรายการที่ต้องติดตาม');
    await this.db.notification.update({ where: { id }, data: { status: 'queued', attempts: 0, nextAttemptAt: null, lastErrorCode: null, channel: n.channel === 'none' ? 'pending' : n.channel, leaseOwner: null, leaseExpiresAt: null } });
    await this.db.$transaction((tx) => this.audit.record(tx, req.actor, { action: 'notification.retry', entity: 'notification', entityId: id, fields: ['status'] }));
    return { id, status: 'queued' };
  }
  /** Development only: what the simulated LINE and email would have delivered. */
  @Get('simulated')
  simulatedMessages() {
    if (this.config.line || this.config.production) throw new AppError(404, 'NOT_FOUND', 'ไม่พบหน้านี้');
    return { items: [...this.simulated.captured()].reverse() };
  }
  @Post('simulated/clear') @HttpCode(200)
  clearSimulated() { this.simulated.clear(); return { cleared: true }; }
}
