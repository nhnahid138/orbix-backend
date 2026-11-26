import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Address,
  Cart,
  CartItem,
  ProductVariant,
  User,
} from '../database/entities.js';
import { AddressDto, CartItemDto } from './shopping.dto.js';

@Injectable()
export class ShoppingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Address) private readonly addresses: Repository<Address>,
    @InjectRepository(Cart) private readonly carts: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItems: Repository<CartItem>,
  ) {}

  listAddresses(userId: number) {
    return this.addresses.find({
      where: { user: { id: userId } },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async createAddress(userId: number, input: AddressDto) {
    return this.dataSource.transaction(async (manager) => {
      if (input.isDefault)
        await manager.update(
          Address,
          { user: { id: userId } },
          { isDefault: false },
        );
      const address = manager.create(Address, {
        recipient: input.recipient,
        phone: input.phone,
        line1: input.line1,
        user: { id: userId } as User,
        line2: input.line2 ?? null,
        city: input.city,
        region: input.region ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? 'BD',
      });
      return manager.save(address);
    });
  }

  async updateAddress(userId: number, id: number, input: Partial<AddressDto>) {
    return this.dataSource.transaction(async (manager) => {
      const address = await manager.findOne(Address, {
        where: { id, user: { id: userId } },
        lock: { mode: 'pessimistic_write' },
      });
      if (!address) throw new NotFoundException('Address not found');
      if (input.isDefault)
        await manager.update(
          Address,
          { user: { id: userId } },
          { isDefault: false },
        );
      Object.assign(address, input);
      return manager.save(address);
    });
  }

  async deleteAddress(userId: number, id: number) {
    const result = await this.addresses.delete({ id, user: { id: userId } });
    if (!result.affected) throw new NotFoundException('Address not found');
    return { deleted: true };
  }

  async getCart(userId: number) {
    const cart = await this.carts.findOne({
      where: { user: { id: userId } },
      relations: { items: { variant: { product: { images: true } } } },
    });
    if (!cart) throw new NotFoundException('Cart not found');
    const items = cart.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      variant: item.variant,
      lineTotalMinor: item.variant.priceMinor * item.quantity,
    }));
    return {
      id: cart.id,
      items,
      subtotalMinor: items.reduce((sum, item) => sum + item.lineTotalMinor, 0),
      currency: 'BDT',
    };
  }

  async addCartItem(userId: number, input: CartItemDto) {
    return this.dataSource.transaction(async (manager) => {
      const cart = await manager.findOne(Cart, {
        where: { user: { id: userId } },
        lock: { mode: 'pessimistic_write' },
      });
      if (!cart) throw new NotFoundException('Cart not found');
      const variant = await manager
        .createQueryBuilder(ProductVariant, 'variant')
        .innerJoinAndSelect('variant.product', 'product')
        .setLock('pessimistic_write')
        .where(
          'variant.id = :id AND variant.is_active = true AND product.status = :status',
          { id: input.variantId, status: 'active' },
        )
        .getOne();
      if (!variant) throw new NotFoundException('Product variant not found');
      let item = await manager.findOne(CartItem, {
        where: { cart: { id: cart.id }, variant: { id: variant.id } },
        lock: { mode: 'pessimistic_write' },
      });
      const nextQuantity = (item?.quantity ?? 0) + input.quantity;
      if (nextQuantity > 99 || nextQuantity > variant.stockQuantity)
        throw new UnprocessableEntityException(
          'Requested quantity is unavailable',
        );
      if (item) item.quantity = nextQuantity;
      else
        item = manager.create(CartItem, {
          cart,
          variant,
          quantity: input.quantity,
        });
      return manager.save(item);
    });
  }

  async updateCartItem(userId: number, id: number, quantity: number) {
    const item = await this.cartItems.findOne({
      where: { id, cart: { user: { id: userId } } },
      relations: { variant: true },
    });
    if (!item) throw new NotFoundException('Cart item not found');
    if (quantity > item.variant.stockQuantity)
      throw new UnprocessableEntityException(
        'Requested quantity is unavailable',
      );
    item.quantity = quantity;
    return this.cartItems.save(item);
  }

  async removeCartItem(userId: number, id: number) {
    const result = await this.cartItems
      .createQueryBuilder()
      .delete()
      .where('id = :id AND cart_id IN (SELECT id FROM carts WHERE user_id = :userId)', {
        id,
        userId,
      })
      .execute();
    if (!result.affected) throw new NotFoundException('Cart item not found');
    return { deleted: true };
  }

  async findAddressForUser(userId: number, addressId: number) {
    const address = await this.addresses.findOneBy({
      id: addressId,
      user: { id: userId },
    });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  async ensureCart(user: User): Promise<Cart> {
    let cart = await this.carts.findOneBy({ user: { id: user.id } });
    if (cart) return cart;
    try {
      return await this.carts.save(this.carts.create({ user }));
    } catch (error) {
      cart = await this.carts.findOneBy({ user: { id: user.id } });
      if (cart) return cart;
      throw error;
    }
  }
}
