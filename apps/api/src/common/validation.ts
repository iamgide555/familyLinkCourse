import { ValidationPipe, type Type } from '@nestjs/common';
import { AppError } from './errors.js';
export function validatedBody(type: Type<unknown>): ValidationPipe {
  return new ValidationPipe({
    expectedType: type,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: () =>
      new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบข้อมูลที่กรอกให้ครบและถูกต้อง'),
  });
}
