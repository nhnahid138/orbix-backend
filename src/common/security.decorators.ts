import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '../database/entities.js';

export const IS_PUBLIC = 'isPublicRoute';
export const ROLES_KEY = 'requiredRoles';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export type AuthenticatedUser = { id: number; email: string; role: UserRole };
export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
  },
);
