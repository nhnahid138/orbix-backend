import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, Public } from '../common/security.decorators.js';
import type { AuthenticatedUser } from '../common/security.decorators.js';
import { PaymentsService } from './payments.service.js';

class EpsIpnDto {
  @IsString() @MinLength(20) @MaxLength(100000) Data: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('methods')
  methods() {
    return this.payments.availableMethods();
  }

  @Post(':paymentId/initialize')
  initialize(
    @Param('paymentId', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.initialize(id, user.id);
  }

  @Get(':paymentId')
  get(
    @Param('paymentId', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.getMine(id, user.id);
  }

  @Public()
  @HttpCode(200)
  @Post('eps/ipn')
  receiveIpn(@Body() body: EpsIpnDto) {
    return this.payments.receiveIpn(body.Data);
  }

  @Public()
  @Get('eps/return')
  async returnFromEps(
    @Query('merchantTransactionId') id: string,
    @Res() response: Response,
  ) {
    const frontend = this.config
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/$/, '');
    try {
      const result = await this.payments.verifyReturn(id);
      return response.redirect(
        303,
        `${frontend}/checkout/return?order=${encodeURIComponent(result.orderNumber)}&status=${encodeURIComponent(result.status)}`,
      );
    } catch {
      return response.redirect(
        303,
        `${frontend}/checkout/return?status=verification_pending`,
      );
    }
  }
}
