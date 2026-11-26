import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';

export class CouponDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code: string;
  @IsString() @Matches(/^(fixed|percent)$/) discountType: 'fixed' | 'percent';
  @Type(() => Number) @IsInt() @Min(1) @Max(100000000) discountValue: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumSubtotalMinor?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maximumDiscountMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) usageLimit?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateCouponDto extends PartialType(CouponDto) {}
