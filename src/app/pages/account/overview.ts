import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Api } from '../../core/api/api.service';
import { OrderSummary } from '../../core/api/models';
import { StoreService } from '../../core/cart/store.service';
import { WishlistService } from '../../core/cart/wishlist.service';
import { ORDER_STATUS_LABEL, statusTone } from '../../core/utils/labels';
import { InrPipe } from '../../shared/pipes/inr.pipe';

@Component({
  selector: 'app-account-overview',
  imports: [RouterLink, DatePipe, InrPipe],
  template: `
    <div class="tiles">
      <a class="tile" routerLink="/account/orders"><i class="bi bi-box-seam"></i><b>{{ total() ?? '–' }}</b><span>Orders</span></a>
      <a class="tile" routerLink="/account/wallet"><i class="bi bi-wallet2"></i><b>{{ (store.walletBalance() ?? 0) | inr }}</b>
        <span>Wallet balance</span></a>
      <a class="tile" routerLink="/wishlist"><i class="bi bi-heart"></i><b>{{ wishlist.count() }}</b><span>Saved pieces</span></a>
      <a class="tile" routerLink="/gift"><i class="bi bi-gift"></i><b>Gift</b><span>Send an e-gift card</span></a>
    </div>

    <section class="panel recent">
      <div class="row"><h2>Recent orders</h2><a class="link-arrow" routerLink="/account/orders">All orders</a></div>
      @for (o of orders(); track o.number) {
        <a class="order" [routerLink]="['/account/orders', o.number]">
          <span class="thumb">@if (o.first_image_url) { <img [src]="o.first_image_url" alt="" loading="lazy" /> }
            @else { <i class="bi bi-gift"></i> }</span>
          <span class="meta"><b>{{ o.number }}</b><small>{{ o.created_at | date: 'd MMM y' }} · {{ o.item_count }}
            {{ o.item_count === 1 ? 'item' : 'items' }}</small></span>
          <span class="status-pill" [class]="'status-pill ' + tone(o.status)">{{ labels[o.status] }}</span>
          <b class="amt">{{ o.total_paise | inr }}</b>
        </a>
      } @empty {
        @if (loaded()) { <p class="muted">No orders yet. <a routerLink="/shop">Find your first piece</a>.</p> }
        @else { <div class="skeleton sk"></div> }
      }
    </section>
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
    @media (min-width: 768px) { .tiles { grid-template-columns: repeat(4, 1fr); } }
    .tile { display: grid; gap: 4px; padding: 18px; border-radius: 16px; background: var(--paper); border: 1px solid var(--line);
      color: var(--ink); text-decoration: none; transition: transform .4s var(--ease-out), box-shadow .4s; }
    .tile:hover { transform: translateY(-4px); box-shadow: var(--shadow-soft); }
    .tile i { font-size: 1.3rem; color: var(--burgundy); } .tile b { font-size: 1.3rem; } .tile span { color: var(--muted); font-size: .8rem; }
    .recent { background: var(--paper); }
    .row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    h2 { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: 1.4rem; }
    .order { display: grid; grid-template-columns: 52px 1fr auto; gap: 12px; align-items: center; padding: 12px 0;
      border-top: 1px solid var(--line); color: var(--ink); text-decoration: none; }
    .order .amt { grid-column: 3; text-align: right; }
    .order .status-pill { grid-column: 2; justify-self: start; }
    @media (min-width: 768px) { .order { grid-template-columns: 52px 1fr auto auto; } .order .status-pill { grid-column: 3; } .order .amt { grid-column: 4; } }
    .thumb { width: 52px; height: 60px; border-radius: 10px; overflow: hidden; background: var(--parchment-light);
      display: grid; place-items: center; grid-row: span 2; }
    @media (min-width: 768px) { .thumb { grid-row: auto; } }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .meta { display: grid; } .meta small { color: var(--muted); }
    .sk { height: 120px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountOverview {
  private readonly api = inject(Api);
  protected readonly store = inject(StoreService);
  protected readonly wishlist = inject(WishlistService);
  protected readonly labels = ORDER_STATUS_LABEL;
  protected readonly tone = statusTone;
  protected readonly orders = signal<OrderSummary[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly loaded = signal(false);

  constructor() {
    this.api.orders(1).subscribe({
      next: (page) => {
        this.orders.set(page.items.slice(0, 4));
        this.total.set(page.total);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }
}
