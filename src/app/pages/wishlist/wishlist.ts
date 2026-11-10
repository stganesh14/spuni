import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';

import { Api } from '../../core/api/api.service';
import { ProductCard } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { WishlistService } from '../../core/cart/wishlist.service';
import { SeoService } from '../../core/seo/seo.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ProductCardComponent } from '../../shared/components/product-card/product-card';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-wishlist-page',
  imports: [ProductCardComponent, EmptyState, RouterLink],
  template: `
    <div class="page">
      <div class="container">
        <header class="page-head">
          <span class="eyebrow">Wishlist</span>
          <h1 class="title">Pieces you <em>love.</em></h1>
          @if (!auth.isLoggedIn() && wishlist.count()) {
            <p class="muted">Saved on this device. <a [routerLink]="'/login'" [queryParams]="{ returnUrl: '/wishlist' }">Sign in</a>
              to keep them across devices.</p>
          }
        </header>
        @if (loading()) {
          <div class="grid">@for (n of [1, 2, 3]; track n) { <div class="skeleton sk"></div> }</div>
        } @else if (visible().length) {
          <div class="grid">
            @for (p of visible(); track p.id; let i = $index) {
              <div class="float-card" [style.--i]="i"><app-product-card [product]="p" [index]="i" /></div>
            }
          </div>
        } @else {
          <app-empty-state icon="bi-heart" title="Nothing saved yet" text="Tap the heart on any piece to keep it here for later."
                           actionLink="/shop" />
        }
      </div>
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 16px; }
    @media (min-width: 1024px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    .sk { aspect-ratio: 4 / 5.6; border-radius: var(--radius-lg); }
    .float-card { animation: rise .8s var(--ease-out) both calc(var(--i) * 70ms); }
    @keyframes rise { from { opacity: 0; transform: translateY(40px) rotate(2deg); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishlistPage {
  private readonly api = inject(Api);
  protected readonly auth = inject(AuthService);
  protected readonly wishlist = inject(WishlistService);
  protected readonly products = signal<ProductCard[]>([]);
  protected readonly loading = signal(true);
  /** Hide items as soon as they're un-hearted. */
  protected readonly visible = () => this.products().filter((p) => this.wishlist.ids().includes(p.id));

  constructor() {
    inject(SeoService).set({ title: 'Wishlist', path: '/wishlist' });
    effect(() => {
      const loggedIn = this.auth.isLoggedIn();
      const ready = this.auth.ready();
      if (!ready) return;
      untracked(() => (loggedIn ? this.loadServer() : this.loadLocal()));
    });
  }

  private loadServer(): void {
    this.wishlist.loadServer().subscribe({
      next: (items) => {
        this.wishlist.replace(items);
        this.products.set(items);
        this.loading.set(false);
      },
      error: () => this.loadLocal(),
    });
  }

  private loadLocal(): void {
    const ids = this.wishlist.ids().slice(0, 60);
    if (!ids.length) {
      this.products.set([]);
      this.loading.set(false);
      return;
    }
    this.api.products({ ids: ids.join(','), page_size: 60 }).subscribe({
      next: (page) => {
        this.products.set(page.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
