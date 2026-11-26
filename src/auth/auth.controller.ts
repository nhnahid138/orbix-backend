import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto.js';
import { CurrentUser, Public } from '../common/security.decorators.js';
import type { AuthenticatedUser } from '../common/security.decorators.js';

const REFRESH_COOKIE = 'orbix_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.issue(await this.auth.register(dto), response);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.issue(await this.auth.login(dto.email, dto.password), response);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertTrustedOrigin(request);
    const token = this.readCookie(request.headers.cookie, REFRESH_COOKIE);
    if (!token) throw new ForbiddenException('Refresh cookie required');
    const { user, pair } = await this.auth.refresh(token);
    this.setRefreshCookie(response, pair.refreshToken);
    return { user, accessToken: pair.accessToken, expiresIn: pair.expiresIn };
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.assertTrustedOrigin(request);
    await this.auth.logout(
      this.readCookie(request.headers.cookie, REFRESH_COOKIE),
    );
    this.clearRefreshCookie(response);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @HttpCode(204)
  @Post('password')
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  private issue(
    data: Awaited<ReturnType<AuthService['register']>>,
    response: Response,
  ) {
    this.setRefreshCookie(response, data.refreshToken);
    return {
      user: data.user,
      accessToken: data.accessToken,
      expiresIn: data.expiresIn,
    };
  }

  private setRefreshCookie(response: Response, token: string): void {
    const sameSite = this.config.get<'lax' | 'strict' | 'none'>(
      'COOKIE_SAME_SITE',
      'lax',
    );
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure:
        this.config.get('NODE_ENV') === 'production' || sameSite === 'none',
      sameSite,
      path: '/api/v1/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    const sameSite = this.config.get<'lax' | 'strict' | 'none'>(
      'COOKIE_SAME_SITE',
      'lax',
    );
    response.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure:
        this.config.get('NODE_ENV') === 'production' || sameSite === 'none',
      sameSite,
      path: '/api/v1/auth',
    });
  }

  private readCookie(
    header: string | undefined,
    name: string,
  ): string | undefined {
    const prefix = `${name}=`;
    return header
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length)
      .split(',')[0]
      .trim();
  }

  private assertTrustedOrigin(request: Request): void {
    const origin = request.headers.origin;
    if (!origin) return;
    const trusted = this.config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!trusted.includes(origin))
      throw new ForbiddenException('Origin is not allowed');
  }
}
