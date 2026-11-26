import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HomeBanner } from '../database/entities.js';
import type { HomeBannerDto, UpdateHomeBannerDto } from './banners.controller.js';

@Injectable()
export class HomeBannerService {
  constructor(
    @InjectRepository(HomeBanner)
    private readonly banners: Repository<HomeBanner>,
  ) {}

  listLive() {
    const now = new Date();
    return this.banners
      .createQueryBuilder('banner')
      .where('banner.is_active = true')
      .andWhere('(banner.starts_at IS NULL OR banner.starts_at <= :now)', { now })
      .andWhere('(banner.ends_at IS NULL OR banner.ends_at > :now)', { now })
      .orderBy('banner.sort_order', 'ASC')
      .addOrderBy('banner.id', 'ASC')
      .getMany();
  }

  listAll() {
    return this.banners.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  create(input: HomeBannerDto) {
    this.validateSchedule(input.startsAt, input.endsAt);
    return this.banners.save(
      this.banners.create({
        ...input,
        subtitle: input.subtitle ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      }),
    );
  }

  async update(id: number, input: UpdateHomeBannerDto) {
    const banner = await this.banners.findOneBy({ id });
    if (!banner) throw new NotFoundException('Banner not found');
    this.validateSchedule(
      input.startsAt === undefined
        ? banner.startsAt
        : input.startsAt
          ? new Date(input.startsAt)
          : null,
      input.endsAt === undefined
        ? banner.endsAt
        : input.endsAt
          ? new Date(input.endsAt)
          : null,
    );
    Object.assign(banner, input);
    if (input.startsAt !== undefined)
      banner.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (input.endsAt !== undefined)
      banner.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    return this.banners.save(banner);
  }

  async archive(id: number) {
    const banner = await this.banners.findOneBy({ id });
    if (!banner) throw new NotFoundException('Banner not found');
    banner.isActive = false;
    return this.banners.save(banner);
  }

  private validateSchedule(
    startsAt?: string | Date | null,
    endsAt?: string | Date | null,
  ): void {
    if (
      startsAt &&
      endsAt &&
      new Date(endsAt).getTime() <= new Date(startsAt).getTime()
    ) {
      throw new BadRequestException('Banner end time must be after its start time');
    }
  }
}
