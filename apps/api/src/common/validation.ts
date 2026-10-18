import { ValidationPipe, type Type } from '@nestjs/common';
import { AppError } from './errors.js';
export function validatedBody(type: Type<unknown>): ValidationPipe {
  return new ValidationPipe({
    expectedType: type,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) =>
      new AppError(
        422,
        'INVALID_INPUT',
        'กรุณาตรวจสอบช่องที่ระบุ',
        Object.fromEntries(errors.map((error) => [error.property, 'กรุณาตรวจสอบข้อมูลในช่องนี้'])),
      ),
  });
}
