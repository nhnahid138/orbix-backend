import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Address,
  Cart,
  CartItem,
  ProductVariant,
} from '../database/entities.js';
import { AddressesController, CartController } from './shopping.controller.js';
import { ShoppingService } from './shopping.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Address, Cart, CartItem, ProductVariant]),
  ],
  controllers: [AddressesController, CartController],
  providers: [ShoppingService],
  exports: [ShoppingService],
})
export class ShoppingModule {}
