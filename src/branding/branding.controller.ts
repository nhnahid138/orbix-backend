import { Body, ConflictException, Controller, Get, Patch } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDefined, IsEmail, IsInt, IsObject, IsString, Matches, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { DataSource } from 'typeorm';
import { CurrentUser, Public, Roles } from '../common/security.decorators.js';
import type { AuthenticatedUser } from '../common/security.decorators.js';
import { AdminAuditLog } from '../database/entities.js';

const destination = /^(?:https?:\/\/[^\s\\/]+(?:[/?#][^\s\\]*)?|\/(?!\/)[^\s\\]*)$/i;
class LinkDto {
  @IsString() @MinLength(1) @MaxLength(100) label!: string;
  @IsString() @Matches(destination) @MaxLength(2048) href!: string;
}
class OutletDto {
  @IsString() @MinLength(1) @MaxLength(160) label!: string;
  @IsString() @MaxLength(500) detail!: string;
  @ValidateIf((_o, value) => value !== '') @IsString() @Matches(destination) @MaxLength(2048) href!: string;
}
class BrandingContent {
  @IsString() @MinLength(1) @MaxLength(100) brand!: string;
  @ValidateIf((_o, value) => value !== '') @IsString() @Matches(destination) @MaxLength(2048) logo!: string;
  @IsString() @MaxLength(400) tagline!: string;
  @IsString() @MaxLength(70) phoneLabel!: string;
  @IsString() @MaxLength(70) emailLabel!: string;
  @IsString() @MaxLength(50) @Matches(/^[+\d ()-]*$/) phone!: string;
  @ValidateIf((_o, value) => value !== undefined) @IsString() @MaxLength(50) @Matches(/^[+\d ()-]*$/) whatsapp?: string;
  @ValidateIf((_o, value) => value !== '') @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MaxLength(80) locationHeading!: string;
  @IsString() @MaxLength(80) aboutHeading!: string;
  @IsString() @MaxLength(80) policyHeading!: string;
  @IsString() @MaxLength(300) copyright!: string;
  @IsString() @MaxLength(160) credit!: string;
  @ValidateIf((_o, value) => value !== '') @IsString() @Matches(destination) @MaxLength(2048) creditUrl!: string;
  @IsArray() @ArrayMaxSize(40) @IsObject({each:true}) @ValidateNested({each:true}) @Type(() => OutletDto) locations!: OutletDto[];
  @IsArray() @ArrayMaxSize(40) @IsObject({each:true}) @ValidateNested({each:true}) @Type(() => LinkDto) about!: LinkDto[];
  @IsArray() @ArrayMaxSize(40) @IsObject({each:true}) @ValidateNested({each:true}) @Type(() => LinkDto) policies!: LinkDto[];
  @IsArray() @ArrayMaxSize(40) @IsObject({each:true}) @ValidateNested({each:true}) @Type(() => LinkDto) apps!: LinkDto[];
  @IsArray() @ArrayMaxSize(40) @IsObject({each:true}) @ValidateNested({each:true}) @Type(() => LinkDto) social!: LinkDto[];
}
class SaveBranding {
  @IsInt() @Min(1) version!: number;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => BrandingContent) content!: BrandingContent;
}
@Controller()
export class BrandingController {
  constructor(private readonly db: DataSource) {}

  @Public() @Get('branding')
  async read() {
    const [row] = await this.db.query('SELECT version, content FROM store_branding WHERE id = 1');
    return row;
  }

  @Roles('admin') @Patch('admin/branding')
  async save(@Body() input: SaveBranding, @CurrentUser() actor: AuthenticatedUser) {
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `WITH saved AS (
          UPDATE store_branding SET content = $1::jsonb, version = version + 1
          WHERE id = 1 AND version = $2 RETURNING version, content
        ) SELECT * FROM saved`, [JSON.stringify(input.content), input.version],
      );
      if (!rows.length) throw new ConflictException('Another admin changed these settings. Reload the page to edit the latest version.');
      await manager.insert(AdminAuditLog, {actor: {id: actor.id}, action: 'branding.update', entityType: 'store_branding', entityId: '1'});
      return rows[0];
    });
  }
}
