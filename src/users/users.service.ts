import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { RefreshToken, User } from '../database/entities.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async updateProfile(
    id: number,
    input: { name?: string; phoneNumber?: string },
  ) {
    const user = await this.users.findOneBy({ id, status: 'active' });
    if (!user) throw new NotFoundException('User not found');
    if (input.name !== undefined) user.name = input.name.trim();
    if (input.phoneNumber !== undefined)
      user.phoneNumber = input.phoneNumber.trim();
    return this.users.save(user);
  }

  async list(page = 1, limit = 20, query?: string) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const where = query
      ? [
          { email: ILike(`%${query.slice(0, 100)}%`) },
          { name: ILike(`%${query.slice(0, 100)}%`) },
        ]
      : {};
    const [items, total] = await this.users.findAndCount({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        role: true,
        status: true,
        createdAt: true,
      },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    return { items, page: safePage, limit: safeLimit, total };
  }

  async updateStatus(
    actorId: number,
    userId: number,
    status: 'active' | 'blocked',
  ) {
    if (actorId === userId && status === 'blocked')
      throw new UnprocessableEntityException(
        'You cannot block your own account',
      );
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('User not found');
      user.status = status;
      await manager.save(user);
      if (status === 'blocked')
        await manager.update(
          RefreshToken,
          { user: { id: userId }, revokedAt: null },
          { revokedAt: new Date() },
        );
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      };
    });
  }
}
