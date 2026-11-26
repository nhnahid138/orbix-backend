import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CurrentUser, Roles } from '../common/security.decorators.js';
import type { AuthenticatedUser } from '../common/security.decorators.js';
import { AdminAuditService } from '../common/admin-audit.service.js';

type ImageUpload = {
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const imageTypes: Record<string, { extension: string; signature: (data: Buffer) => boolean }> = {
  'image/jpeg': { extension: 'jpg', signature: (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  'image/png': { extension: 'png', signature: (data) => data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: 'webp', signature: (data) => data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' },
  'image/avif': { extension: 'avif', signature: (data) => data.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(data.toString('ascii', 8, 16)) },
};

const imageInterceptor = FileInterceptor('file', {
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!imageTypes[file.mimetype]) {
      callback(new BadRequestException('Upload a JPG, PNG, WebP or AVIF image'), false);
      return;
    }
    callback(null, true);
  },
});

@Roles('admin')
@Controller('admin/media')
export class AdminMediaController {
  constructor(
    private readonly config: ConfigService,
    private readonly audit: AdminAuditService,
  ) {}

  @Post('products')
  @UseInterceptors(imageInterceptor)
  uploadProductImage(
    @UploadedFile() file: ImageUpload | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.storeImage('products', file, user, request);
  }

  @Post('categories')
  @UseInterceptors(imageInterceptor)
  uploadCategoryImage(
    @UploadedFile() file: ImageUpload | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.storeImage('categories', file, user, request);
  }

  @Post('banners')
  @UseInterceptors(imageInterceptor)
  uploadBannerImage(
    @UploadedFile() file: ImageUpload | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.storeImage('banners', file, user, request);
  }

  @Post('logos')
  @UseInterceptors(imageInterceptor)
  uploadLogo(
    @UploadedFile() file: ImageUpload | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.storeImage('logos', file, user, request);
  }

  private async storeImage(
    folder: 'products' | 'banners' | 'logos' | 'categories',
    file: ImageUpload | undefined,
    user: AuthenticatedUser,
    request: Request,
  ) {
    if (!file) throw new BadRequestException('Choose an image to upload');
    const imageType = imageTypes[file.mimetype];
    if (!imageType.signature(file.buffer))
      throw new BadRequestException('The uploaded file is not a valid image');

    const uploadRoot = this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    const imageDir = join(uploadRoot, folder);
    const entityType = { products: 'product_image', banners: 'banner_image', logos: 'store_logo', categories: 'category_cover' }[folder];
    await mkdir(imageDir, { recursive: true });
    const filename = `${randomUUID()}.${imageType.extension}`;
    await writeFile(join(imageDir, filename), file.buffer, { flag: 'wx', mode: 0o644 });

    try {
      await this.audit.record({
        actorId: user.id,
        action: `media.${entityType}.upload`,
        entityType,
        ip: request.ip,
        metadata: { filename, contentType: file.mimetype, size: file.size },
      });
    } catch (error) {
      const { unlink } = await import('node:fs/promises');
      await unlink(join(imageDir, filename)).catch(() => undefined);
      throw error;
    }

    if (folder === 'logos') return { url: `/media/logos/${filename}` };
    const port = this.config.get<number>('PORT', 4000);
    const publicApi = this.config.get<string>('API_PUBLIC_URL') || `http://localhost:${port}`;
    return { url: new URL(`/media/${folder}/${filename}`, publicApi).toString() };
  }
}
