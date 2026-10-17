import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
export class AppError extends HttpException {
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super({ code, message, ...(fields ? { fields } : {}) }, status);
  }
}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof AppError) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const message =
      status === 404
        ? 'ไม่พบข้อมูลที่ต้องการ'
        : status === 401
          ? 'กรุณาเข้าสู่ระบบอีกครั้ง'
          : 'ระบบยังไม่สามารถทำรายการได้ กรุณาลองอีกครั้ง';
    response.status(status).json({
      code: status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHENTICATED' : 'REQUEST_FAILED',
      message,
    });
  }
}
