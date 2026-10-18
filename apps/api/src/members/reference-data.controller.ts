import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.guard.js';
import { AppError } from '../common/errors.js';
import { ReferenceData } from './reference-data.service.js';

@Roles('admin', 'staff')
@Controller('reference/address')
export class ReferenceDataController {
  constructor(@Inject(ReferenceData) private readonly refs: ReferenceData) {}
  @Get('provinces') provinces() { return { items: this.refs.provinces() }; }
  @Get('districts') districts(@Query('province') province?: string) {
    if (!province || typeof province !== 'string') throw new AppError(422, 'INVALID_ADDRESS', 'กรุณาเลือกจังหวัด');
    return { items: this.refs.districts(province) };
  }
  @Get('subdistricts') subdistricts(@Query('province') province?: string, @Query('district') district?: string) {
    if (!province || !district || typeof province !== 'string' || typeof district !== 'string') throw new AppError(422, 'INVALID_ADDRESS', 'กรุณาเลือกจังหวัดและอำเภอ');
    return { items: this.refs.subdistricts(province, district) };
  }
}
