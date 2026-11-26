import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,30}$/)
  phoneNumber?: string;
}
export class UpdateUserStatusDto {
  @IsIn(['active', 'blocked']) status: 'active' | 'blocked';
}
