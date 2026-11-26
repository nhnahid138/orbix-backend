import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
export class CreateReviewDto {
  @Type(() => Number) @IsInt() @Min(1) variantId: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(180) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
}
export class ModerateReviewDto {
  @IsIn(['published', 'rejected']) status: 'published' | 'rejected';
}
