import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/security.decorators.js';
import type { AuthenticatedUser } from '../common/security.decorators.js';
import {
  AddressDto,
  CartItemDto,
  UpdateAddressDto,
  UpdateCartItemDto,
} from './shopping.dto.js';
import { ShoppingService } from './shopping.service.js';

@Controller('addresses')
export class AddressesController {
  constructor(private readonly shopping: ShoppingService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) {
    return this.shopping.listAddresses(user.id);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddressDto,
  ) {
    return this.shopping.createAddress(user.id, dto);
  }
  @Patch(':id') update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.shopping.updateAddress(user.id, id, dto);
  }
  @Delete(':id') remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.shopping.deleteAddress(user.id, id);
  }
}

@Controller('cart')
export class CartController {
  constructor(private readonly shopping: ShoppingService) {}
  @Get() get(@CurrentUser() user: AuthenticatedUser) {
    return this.shopping.getCart(user.id);
  }
  @Post('items') add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CartItemDto,
  ) {
    return this.shopping.addCartItem(user.id, dto);
  }
  @Patch('items/:id') update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.shopping.updateCartItem(user.id, id, dto.quantity);
  }
  @Delete('items/:id') remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.shopping.removeCartItem(user.id, id);
  }
}
