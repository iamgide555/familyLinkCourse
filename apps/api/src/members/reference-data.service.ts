import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors.js';
import type { StaffIntakeInput } from '../../../../packages/contracts/src/members.js';
import { THAI_ADDRESSES } from './thai-addresses.js';

const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'th'));
@Injectable()
export class ReferenceData {
  provinces() { return unique(THAI_ADDRESSES.map((row) => row[0])); }
  districts(province: string) {
    if (!this.provinces().includes(province)) throw new AppError(422, 'INVALID_ADDRESS', 'ไม่พบจังหวัด');
    return unique(THAI_ADDRESSES.filter((row) => row[0] === province).map((row) => row[1]));
  }
  subdistricts(province: string, district: string) {
    if (!this.districts(province).includes(district)) throw new AppError(422, 'INVALID_ADDRESS', 'ไม่พบอำเภอหรือเขต');
    return unique(THAI_ADDRESSES.filter((row) => row[0] === province && row[1] === district).map((row) => row[2]))
      .map((name) => ({ name, postcodes: unique(THAI_ADDRESSES.filter((row) => row[0] === province && row[1] === district && row[2] === name).map((row) => row[3])) }));
  }
  validateAddress(input: StaffIntakeInput) {
    const { provinceId = '', districtId = '', subdistrictId = '', postcode = '' } = input;
    const fields: Record<string, string> = {};
    if (provinceId && !this.provinces().includes(provinceId)) fields['provinceId'] = 'ไม่พบจังหวัด';
    if (districtId && (!provinceId || fields['provinceId'] || !this.districts(provinceId).includes(districtId))) fields['districtId'] = 'อำเภอหรือเขตไม่ตรงกับจังหวัด';
    if (subdistrictId && (!districtId || fields['districtId'] || !this.subdistricts(provinceId, districtId).some((x) => x.name === subdistrictId))) fields['subdistrictId'] = 'ตำบลหรือแขวงไม่ตรงกับอำเภอ';
    if (postcode && (!subdistrictId || fields['subdistrictId'] || !this.subdistricts(provinceId, districtId).find((x) => x.name === subdistrictId)?.postcodes.includes(postcode))) fields['postcode'] = 'รหัสไปรษณีย์ไม่ตรงกับที่อยู่';
    if (Object.keys(fields).length) throw new AppError(422, 'INVALID_ADDRESS', 'กรุณาตรวจสอบที่อยู่', fields);
    if (subdistrictId && !postcode) {
      const postcodes = this.subdistricts(provinceId, districtId).find((x) => x.name === subdistrictId)!.postcodes;
      if (postcodes.length === 1) input.postcode = postcodes[0];
    }
  }
}
