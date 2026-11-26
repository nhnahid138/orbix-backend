import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AddressDto {
  @IsString() @MinLength(2) @MaxLength(120) recipient: string;
  @IsString() @Matches(/^\+?[0-9 ()-]{7,30}$/) phone: string;
  @IsString() @MinLength(3) @MaxLength(220) line1: string;
  @IsOptional() @IsString() @MaxLength(220) line2?: string;
  @IsString() @MinLength(2) @MaxLength(100) city: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{2}$/) country?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
export class UpdateAddressDto extends PartialType(AddressDto) {}
export class CartItemDto {
  @Type(() => Number) @IsInt() @Min(1) variantId: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(99) quantity: number;
}
export class UpdateCartItemDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(99) quantity: number;
}
export class CheckoutDto {
  @Type(() => Number) @IsInt() @Min(1) addressId: number;
  @IsOptional() @IsString() @MaxLength(40) couponCode?: string;
  @IsString() @Matches(/^(eps|cod)$/) paymentProvider: 'eps' | 'cod';
}
