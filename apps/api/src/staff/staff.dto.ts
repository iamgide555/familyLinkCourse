import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
export class CreateStaffInput {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsString() @MinLength(12) @MaxLength(256) password!: string;
  @IsIn(['admin', 'staff']) role!: 'admin' | 'staff';
}
export class UpdateStaffInput {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsIn(['admin', 'staff']) role?: 'admin' | 'staff';
  @IsOptional() @IsString() @MinLength(12) @MaxLength(256) password?: string;
  @ValidateIf((_object, value) => value !== undefined && value !== null) @IsUUID() memberId?:
    string | null;
}
