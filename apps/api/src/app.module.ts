import 'reflect-metadata';
import {
  Controller,
  Get,
  Inject,
  Module,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { existsSync } from 'node:fs';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { APP_CONFIG, validateConfig, type ApplicationConfig } from './config/config.js';
import { Clock } from './common/clock.js';
import { ApiExceptionFilter, AppError } from './common/errors.js';
import { PrismaService } from './database/prisma.service.js';
import { AuthController } from './auth/auth.controller.js';
import { SessionService } from './auth/session.service.js';
import { AuthGuard, Public } from './auth/auth.guard.js';
import { StaffController } from './staff/staff.controller.js';
import { StaffService } from './staff/staff.service.js';
import { Audit } from './audit/audit.service.js';
import { Authorization } from './authorization/authorization.service.js';
import { FieldCrypto } from './crypto/field-crypto.js';
import { Members } from './members/members.service.js';
import { MembersController } from './members/members.controller.js';
import { CaseNotes } from './case-notes/case-notes.service.js';
import { CaseNotesController } from './case-notes/case-notes.controller.js';
import { ReferenceData } from './members/reference-data.service.js';
import { ReferenceDataController } from './members/reference-data.controller.js';
import { Settings } from './settings/settings.service.js';
import { SettingsController } from './settings/settings.controller.js';
import { MemberAdmin } from './members/member-admin.service.js';
import { MemberAdminController } from './members/member-admin.controller.js';
import { Forms } from './forms/forms.service.js';
import { FormsController } from './forms/forms.controller.js';
import { InvitesController, SignupController, SignupReviewsController } from './signup/signup.controller.js';
import { Invites } from './signup/invites.service.js';
import { Signup } from './signup/signup.service.js';
import { Outbox } from './notifications/outbox.service.js';
import { ParticipantIdentity } from './identity/identity.service.js';
import { DevIdentityAdapter } from './identity/dev-identity.adapter.js';
import { Courses } from './courses/courses.service.js';
import { CoursesController } from './courses/courses.controller.js';
import { Questions } from './questions/questions.service.js';
import { RunLock } from './bookings/run-lock.js';
import { Queue } from './bookings/queue.service.js';
import { Snapshots } from './bookings/snapshots.service.js';
import { Bookings } from './bookings/bookings.service.js';
import { Registrations } from './bookings/registrations.service.js';
import { Walkins } from './bookings/walkins.service.js';
import { StaffBookingsController, MemberBookingsController } from './bookings/bookings.controller.js';
import { Attendance } from './attendance/attendance.service.js';
import { AttendanceController } from './attendance/attendance.controller.js';
import { Memberships } from './memberships/memberships.service.js';
import { MembershipsController } from './memberships/memberships.controller.js';
import { Dashboard } from './dashboard/dashboard.service.js';
import { DashboardController } from './dashboard/dashboard.controller.js';
import { Reports } from './reports/reports.service.js';
import { ReportsController } from './reports/reports.controller.js';
import { OrgSettings } from './settings/org-settings.service.js';
import { LineTransport } from './notifications/line.transport.js';
import { EmailTransport } from './notifications/email.transport.js';
import { SimulatedTransport } from './notifications/simulated.transport.js';
import { MessageBuilder } from './notifications/message-builder.js';
import { NotificationWorker } from './notifications/notification-worker.js';
import { CallList } from './notifications/call-list.service.js';
import { Reminders } from './notifications/reminders.service.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import { Retention } from './jobs/retention.job.js';
import { Scheduler } from './jobs/scheduler.js';
import { LineApiClient } from './line/line-api.client.js';
import { RichMenus } from './line/rich-menu.service.js';
import { LineWebhookController } from './line/line-webhook.controller.js';
import { LineIdentityAdapter } from './identity/line-identity.adapter.js';
import { Linking } from './linking/line-linking.service.js';
import { ProfileChanges } from './profile/profile-changes.service.js';
import { ParticipantProfileController, StaffReviewController } from './profile/profile.controller.js';
import { Documents } from './documents/documents.service.js';
import { FileStore } from './documents/file-store.js';
import { MemberDocumentsController, StaffDocumentsController } from './documents/documents.controller.js';
@Controller('health')
class HealthController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  @Public() @Get() async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
export async function createApplication(
  config: ApplicationConfig,
  clock: Clock,
): Promise<INestApplication> {
  validateConfig(config);
  @Module({
    controllers: [AuthController, StaffController, HealthController, MembersController, CaseNotesController, ReferenceDataController, SettingsController, MemberAdminController, FormsController, InvitesController, SignupController, SignupReviewsController, MemberDocumentsController, StaffDocumentsController, ParticipantProfileController, StaffReviewController, CoursesController, StaffBookingsController, MemberBookingsController, AttendanceController, MembershipsController, DashboardController, ReportsController, NotificationsController, LineWebhookController],
    providers: [
      { provide: APP_CONFIG, useValue: config },
      { provide: Clock, useValue: clock },
      PrismaService,
      SessionService,
      StaffService,
      Audit,
      Authorization,
      Members,
      CaseNotes,
      ReferenceData,
      Settings,
      MemberAdmin,
      Forms,
      Invites,
      Signup,
      Outbox,
      Documents,
      Linking,
      Courses, Questions, RunLock, Queue, Snapshots, Bookings, Registrations, Walkins, Attendance, Memberships, Dashboard, Reports, OrgSettings,
      LineTransport, EmailTransport, SimulatedTransport, MessageBuilder, NotificationWorker, CallList, Reminders, Retention, Scheduler, LineApiClient, RichMenus, LineIdentityAdapter,
      ProfileChanges,
      FileStore,
      DevIdentityAdapter,
      // Real LINE verification whenever LINE is configured and the development shortcut is off; production always.
      { provide: ParticipantIdentity, useExisting: config.production || (config.line && !config.devIdentityEnabled) ? LineIdentityAdapter : DevIdentityAdapter },
      {
        provide: FieldCrypto,
        useFactory: () => new FieldCrypto(config.encryptionKey, config.blindIndexKey),
      },
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  })
  class ApplicationModule {}
  const app = await NestFactory.create(ApplicationModule, { logger: false, rawBody: true });
  app.setGlobalPrefix('api');
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
  app.use(helmet());
  app.use((req: { method: string; path: string }, res: { status(code: number): { json(body: unknown): void } }, next: () => void) => {
    // Backup window: reads continue, writes wait. Sign-in is refused too so no session churn lands mid-dump.
    if (config.maintenanceFlag && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.path !== '/api/health' && existsSync(config.maintenanceFlag)) {
      res.status(503).json({ code: 'MAINTENANCE', message: 'ระบบกำลังสำรองข้อมูล กรุณาลองอีกครั้งในอีกสักครู่' });
      return;
    }
    next();
  });
  app.use(cookieParser());
  app.use(
    (_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new AppError(
          422,
          'INVALID_INPUT',
          'กรุณาตรวจสอบช่องที่ระบุ',
          Object.fromEntries(
            errors.map((error) => [error.property, 'กรุณาตรวจสอบข้อมูลในช่องนี้']),
          ),
        ),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
