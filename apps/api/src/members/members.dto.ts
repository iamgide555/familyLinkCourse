import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsArray,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { normalizePhone } from './member-validation.js';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const phone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizePhone(value) : value;
export class StaffIntakeDto {
  @Transform(trim) @IsString() @MaxLength(150) firstName!: string;
  @Transform(trim) @IsString() @MaxLength(150) lastName!: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(10)
  birthDate?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(phone)
  @IsString()
  @MaxLength(20)
  phoneMobile?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== '')
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['', 'caregiver', 'disabled', 'at_risk'])
  memberType?: '' | 'caregiver' | 'disabled' | 'at_risk';
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
  )
  @IsString()
  @MaxLength(20)
  citizenId?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  disabilityType?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(100)
  householdIncome?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000) householdSize?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1000) householdEarners?: number | null;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @MaxLength(100) provinceId?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @MaxLength(100) districtId?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @MaxLength(100) subdistrictId?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString() @MaxLength(5) postcode?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray() @IsString({ each: true }) @MaxLength(100, { each: true }) requestedServiceIds?: string[];
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt() @Min(0) expectedVersion?: number;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  address?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(phone)
  @IsString()
  @MaxLength(20)
  phoneHome?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(300)
  facebook?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(150)
  maritalStatus?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(150)
  education?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(150)
  occupation?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(150)
  housing?: string;
  @IsOptional() @IsString() @MaxLength(100) caregiverMemberId?: string | null;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(300)
  caregiverName?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(150)
  caregiverRelationship?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(phone)
  @IsString()
  @MaxLength(20)
  caregiverPhone?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(300)
  emergencyName?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(150)
  emergencyRelationship?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(phone)
  @IsString()
  @MaxLength(20)
  emergencyPhone?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['create_new'])
  duplicateDecision?: 'create_new';
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  duplicateReason?: string;
}
