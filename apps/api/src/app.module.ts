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
    controllers: [AuthController, StaffController, HealthController],
    providers: [
      { provide: APP_CONFIG, useValue: config },
      { provide: Clock, useValue: clock },
      PrismaService,
      SessionService,
      StaffService,
      Audit,
      Authorization,
      {
        provide: FieldCrypto,
        useFactory: () => new FieldCrypto(config.encryptionKey, config.blindIndexKey),
      },
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  })
  class ApplicationModule {}
  const app = await NestFactory.create(ApplicationModule, { logger: false });
  app.setGlobalPrefix('api');
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
  app.use(helmet());
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
      exceptionFactory: () =>
        new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบข้อมูลที่กรอกให้ครบและถูกต้อง'),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
