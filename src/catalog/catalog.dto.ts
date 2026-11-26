import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
  ValidateNested,
} from 'class-validator';

export class CategoryDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(120) slug?: string;
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsString() @MaxLength(2048) coverImageUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(2048) mainImageUrl?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) parentId?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateCategoryDto extends PartialType(CategoryDto) {}

export class VariantDto {
  @IsString() @MinLength(1) @MaxLength(80) sku: string;
  @IsOptional() @IsString() @MaxLength(140) name?: string;
  @IsOptional() @IsObject() attributes?: Record<string, string>;
  @Type(() => Number) @IsInt() @Min(0) @Max(2_000_000_000) priceMinor: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  compareAtMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2_000_000_000)
  costMinor?: number | null;
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  stockQuantity: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ProductImageDto {
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(2048)
  url: string;
  @IsOptional() @IsString() @MaxLength(180) alt?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class ProductDto {
  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsString() @MinLength(1) @MaxLength(180) name: string;
  @IsOptional() @IsString() @MaxLength(200) slug?: string;
  @IsOptional() @IsString() @MaxLength(20000) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) categoryId?: number;
  @IsOptional() @IsIn(['draft', 'active', 'archived']) status?:
    'draft' | 'active' | 'archived';
  @IsOptional() @IsString() @MaxLength(180) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(320) seoDescription?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants: VariantDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];
}
export class UpdateProductDto extends PartialType(ProductDto) {}

export class StockAdjustmentDto {
  @Type(() => Number) @IsInt() @Min(1) variantId: number;
  @Type(() => Number)
  @IsInt()
  @Min(-100000)
  @Max(100000)
  @NotEquals(0, { message: 'Quantity change cannot be zero' })
  quantityDelta: number;
  @IsString() @MinLength(3) @MaxLength(40) reason: string;
  @IsOptional() @IsString() @MaxLength(240) note?: string;
}
