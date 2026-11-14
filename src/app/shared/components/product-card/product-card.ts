import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProductCard as Product } from '../../../core/api/models';
import { CartService } from '../../../core/cart/cart.service';
import { WishlistService } from '../../../core/cart/wishlist.service';
import { TiltDirective } from '../../directives/tilt.directive';
import { ZoomableDirective } from '../../directives/zoomable.directive';
import { InrPipe } from '../../pipes/inr.pipe';

@Component({
  selector: 'app-product-card',
  imports: [RouterLink, InrPipe, ZoomableDirective, TiltDirective],
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent {
  private readonly cart = inject(CartService);
  protected readonly wishlist = inject(WishlistService);

  readonly product = input.required<Product>();
  readonly index = input(0);
  readonly eager = input(false);
  readonly showDetailsOnImage = input(false);

  protected readonly link = computed(() => `/product/${this.product().slug}`);
  protected readonly saved = computed(() => this.wishlist.ids().includes(this.product().id));
  protected readonly discount = computed(() => {
    const p = this.product();
    return p.compare_at_price_paise
      ? Math.round((1 - p.price_paise / p.compare_at_price_paise) * 100)
      : 0;
  });
  protected readonly gallery = computed(() => {
    const p = this.product();
    return [p.image_url, p.hover_image_url].filter((u): u is string => !!u).map((url) => ({ url, alt: p.name }));
  });

  addToBag(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.product().in_stock) this.cart.add(this.product());
  }

  toggleWishlist(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.wishlist.toggle(this.product());
  }
}
