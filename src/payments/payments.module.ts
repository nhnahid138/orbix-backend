import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../database/entities.js';
import { EpsClient } from './eps.client.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  controllers: [PaymentsController],
  providers: [EpsClient, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
