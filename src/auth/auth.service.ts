import { createHash, randomUUID } from 'node:crypto';
import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { Cart, RefreshToken, User } from '../database/entities.js';
import { AuthenticatedUser } from '../common/security.decorators.js';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};
type RefreshOutcome = { pair?: TokenPair; replay?: boolean };

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async onModuleInit(): Promise<void> {
    const bootstrapEmail = this.config
      .get<string>('BOOTSTRAP_ADMIN_EMAIL')
      ?.trim()
      .toLowerCase();
    const bootstrapPassword = this.config.get<string>(
      'BOOTSTRAP_ADMIN_PASSWORD',
    );
    if (!bootstrapEmail && !bootstrapPassword) return;
    if (
      !bootstrapEmail ||
      !bootstrapPassword ||
      bootstrapPassword.length < 16
    ) {
      throw new Error(
        'Set both BOOTSTRAP_ADMIN_EMAIL and a 16+ character BOOTSTRAP_ADMIN_PASSWORD, or leave both empty',
      );
    }
    const found = await this.users.findOne({
      where: { email: bootstrapEmail },
    });
    if (found) return;
    const user = this.users.create({
      name:
        this.config.get<string>('BOOTSTRAP_ADMIN_NAME') ??
        'Store Administrator',
      email: bootstrapEmail,
      passwordHash: await hash(bootstrapPassword, 12),
      role: 'admin',
      status: 'active',
    });
    await this.users.save(user);
  }

  async register(input: {
    name: string;
    email: string;
    password: string;
    phoneNumber?: string;
  }) {
    const email = input.email.trim().normalize('NFC').toLowerCase();
    const user = await this.dataSource
      .transaction(async (manager) => {
        if (await manager.exists(User, { where: { email } }))
          throw new ConflictException('Account already exists');
        const created = manager.create(User, {
          name: input.name.trim(),
          email,
          phoneNumber: input.phoneNumber?.trim() ?? null,
          passwordHash: await hash(input.password, 12),
          role: 'customer',
          status: 'active',
        });
        const saved = await manager.save(created);
        await manager.save(manager.create(Cart, { user: saved }));
        return saved;
      })
      .catch((error: unknown) => {
        if (error instanceof ConflictException) throw error;
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '23505'
        ) {
          throw new ConflictException('Account already exists');
        }
        throw error;
      });
    const pair = await this.issueTokens(user, randomUUID());
    return { user: this.publicUser(user), ...pair };
  }

  async login(emailInput: string, password: string) {
    const email = emailInput.trim().normalize('NFC').toLowerCase();
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
    if (!user || !(await compare(password, user.passwordHash)))
      throw new UnauthorizedException('Invalid email or password');
    if (user.status !== 'active')
      throw new UnauthorizedException('Account is unavailable');
    const pair = await this.issueTokens(user, randomUUID());
    return { user: this.publicUser(user), ...pair };
  }

  async refresh(
    rawToken: string,
  ): Promise<{ user: AuthenticatedUser; pair: TokenPair }> {
    let claims: {
      sub: number;
      jti: string;
      familyId: string;
      tokenType: string;
    };
    try {
      claims = await this.jwt.verifyAsync(rawToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (claims.tokenType !== 'refresh' || !claims.familyId)
      throw new UnauthorizedException('Invalid refresh token');

    const result = await this.dataSource.transaction<RefreshOutcome>(
      async (manager) => {
        const stored = await manager
          .createQueryBuilder(RefreshToken, 'token')
          .innerJoinAndSelect('token.user', 'user')
          .setLock('pessimistic_write')
          .where('token.tokenHash = :tokenHash', {
            tokenHash: this.tokenHash(rawToken),
          })
          .getOne();
        if (!stored) return {};
        if (
          stored.familyId !== claims.familyId ||
          stored.user.id !== claims.sub
        )
          return {};
        if (stored.revokedAt) {
          await manager.update(
            RefreshToken,
            { familyId: stored.familyId, revokedAt: IsNull() },
            { revokedAt: new Date() },
          );
          return { replay: true };
        }
        if (stored.expiresAt <= new Date() || stored.user.status !== 'active')
          return {};
        stored.revokedAt = new Date();
        await manager.save(stored);
        const pair = await this.issueTokens(
          stored.user,
          stored.familyId,
          manager,
        );
        return { pair };
      },
    );

    if (result.replay)
      throw new UnauthorizedException(
        'Refresh token reuse detected; sign in again',
      );
    if (!result.pair)
      throw new UnauthorizedException('Invalid or expired refresh token');
    const claimsUser = await this.users.findOneByOrFail({ id: claims.sub });
    return { user: this.publicUser(claimsUser), pair: result.pair };
  }

  async logout(rawToken?: string): Promise<void> {
    if (!rawToken) return;
    await this.dataSource.transaction(async (manager) => {
      const stored = await manager.findOne(RefreshToken, {
        where: { tokenHash: this.tokenHash(rawToken), revokedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (stored) {
        stored.revokedAt = new Date();
        await manager.save(stored);
      }
    });
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user || !(await compare(currentPassword, user.passwordHash)))
      throw new UnauthorizedException('Current password is incorrect');
    user.passwordHash = await hash(newPassword, 12);
    await this.dataSource.transaction(async (manager) => {
      await manager.save(user);
      await manager.update(
        RefreshToken,
        { user: { id: userId }, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    });
  }

  private async issueTokens(
    user: User,
    familyId: string,
    manager?: EntityManager,
  ): Promise<TokenPair> {
    const issuer = this.config.getOrThrow<string>('JWT_ISSUER');
    const audience = this.config.getOrThrow<string>('JWT_AUDIENCE');
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role, tokenType: 'access' },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer,
        audience,
        expiresIn: 900,
      },
    );
    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti, familyId, tokenType: 'refresh' },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        issuer,
        audience,
        expiresIn: 60 * 60 * 24 * 30,
      },
    );
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const repo =
      manager?.getRepository(RefreshToken) ??
      this.dataSource.getRepository(RefreshToken);
    await repo.save(
      repo.create({
        user,
        tokenHash: this.tokenHash(refreshToken),
        familyId,
        expiresAt,
        revokedAt: null,
      }),
    );
    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicUser(
    user: User,
  ): AuthenticatedUser & { name: string; phoneNumber: string | null } {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      phoneNumber: user.phoneNumber,
    };
  }
}
