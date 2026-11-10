import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { CartService, MAX_QTY } from '../../core/cart/cart.service';
import { QuoteService } from '../../core/cart/quote.service';
import { StoreService } from '../../core/cart/store.service';
import { SeoService } from '../../core/seo/seo.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { InrPipe } from '../../shared/pipes/inr.pipe';

@Component({
  selector: 'app-cart-page',
  imports: [RouterLink, InrPipe, EmptyState],
  templateUrl: './cart.html',
  styleUrl: './cart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartPage {
  protected readonly cart = inject(CartService);
  protected readonly quotes = inject(QuoteService);
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(StoreService);
  protected readonly maxQty = MAX_QTY;

  protected readonly quote = this.quotes.quote;
  protected readonly lineInfo = computed(() => new Map((this.quote()?.lines ?? []).map((l) => [l.product_id, l])));
  protected readonly subtotal = computed(() => this.quote()?.subtotal_paise ?? this.cart.subtotalHint());
  protected readonly shipping = computed(() => this.quote()?.shipping_paise ?? null);
  protected readonly total = computed(() => this.quote()?.total_paise ?? this.subtotal());
  protected readonly threshold = computed(() => this.quote()?.free_shipping_threshold_paise ?? 0);
  protected readonly toFree = computed(() => Math.max(0, this.threshold() - this.subtotal()));
  protected readonly progress = computed(() =>
    this.threshold() ? Math.min(100, (this.subtotal() / this.threshold()) * 100) : 100,
  );
  protected readonly reward = computed(() => this.quote()?.wallet_reward_estimate_paise ?? 0);

  constructor() {
    inject(SeoService).set({ title: 'Your bag', path: '/cart' });
    this.store.loadInfo().subscribe();
    effect(() => {
      this.cart.items();
      untracked(() => this.quotes.refresh());
    });
  }

  qty(productId: number, value: number): void {
    this.cart.setQuantity(productId, value);
  }
}
