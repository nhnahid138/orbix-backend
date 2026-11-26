import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  AuthenticatedRequest,
  IS_PUBLIC,
  ROLES_KEY,
} from './security.decorators.js';
import { User, UserRole } from '../database/entities.js';

type AccessClaims = {
  sub: number;
  email: string;
  role: UserRole;
  tokenType: 'access';
  iss: string;
  aud: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token)
      throw new UnauthorizedException('Authentication required');

    try {
      const claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      });
      if (claims.tokenType !== 'access' || !Number.isInteger(claims.sub))
        throw new UnauthorizedException();
      const user = await this.users.findOne({
        where: { id: claims.sub, status: 'active' },
      });
      if (!user) throw new UnauthorizedException();
      request.user = { id: user.id, email: user.email, role: user.role };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user || !required.includes(request.user.role))
      throw new ForbiddenException();
    return true;
  }
}
