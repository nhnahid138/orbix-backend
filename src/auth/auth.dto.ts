import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsEmail() @MaxLength(320) email: string;
  @IsString() @MinLength(12) @MaxLength(128) password: string;
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,30}$/)
  phoneNumber?: string;
}

export class LoginDto {
  @IsEmail() @MaxLength(320) email: string;
  @IsString() @MaxLength(128) password: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(128) currentPassword: string;
  @IsString() @MinLength(12) @MaxLength(128) newPassword: string;
}
