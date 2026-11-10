import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Api } from '../../core/api/api.service';
import { OrderSummary } from '../../core/api/models';
import { ORDER_STATUS_LABEL, statusTone } from '../../core/utils/labels';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { InrPipe } from '../../shared/pipes/inr.pipe';

@Component({
  selector: 'app-account-orders',
  imports: [RouterLink, DatePipe, InrPipe, EmptyState],
  template: `
    <section class="panel">
      <h2>Orders</h2>
      @for (o of orders(); track o.number; let i = $index) {
        <a class="order" [routerLink]="['/account/orders', o.number]" [style.--i]="i">
          <span class="thumb">@if (o.first_image_url) { <img [src]="o.first_image_url" alt="" loading="lazy" /> }
            @else { <i class="bi bi-gift"></i> }</span>
          <span class="meta"><b>{{ o.number }}</b>
            <small>{{ o.created_at | date: 'd MMM y' }} · {{ o.order_type === 'gift_card' ? 'E-gift card' : o.item_count + (o.item_count === 1 ? ' item' : ' items') }}</small></span>
          <span class="status-pill" [class]="'status-pill ' + tone(o.status)">{{ labels[o.status] }}</span>
          <b class="amt">{{ o.total_paise | inr }}</b>
        </a>
      } @empty {
        @if (loaded()) {
          <app-empty-state icon="bi-box-seam" title="No orders yet" text="When you place an order it will appear here with live tracking."
                           actionLink="/shop" />
        } @else { <div class="skeleton sk"></div> }
      }
      @if (pages() > page()) {
        <button type="button" class="btn btn-ghost more" (click)="load(page() + 1)" [disabled]="busy()">
          @if (busy()) { <span class="spin"></span> } Load more</button>
      }
    </section>
  `,
  styles: `
    .panel { background: var(--paper); }
    h2 { margin: 0 0 12px; font-family: var(--font-display); font-weight: 400; font-size: 1.5rem; }
    .order { display: grid; grid-template-columns: 56px 1fr auto; gap: 6px 14px; align-items: center; padding: 14px 0;
      border-top: 1px solid var(--line); color: var(--ink); text-decoration: none;
      animation: rise .5s var(--ease-out) both calc(var(--i) * 40ms); }
    .order:hover b:first-child { color: var(--burgundy); }
    .thumb { grid-row: span 2; width: 56px; height: 66px; border-radius: 10px; overflow: hidden; background: var(--parchment-light);
      display: grid; place-items: center; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .meta { display: grid; } .meta small { color: var(--muted); }
    .status-pill { grid-column: 2; justify-self: start; } .amt { grid-column: 3; grid-row: 1; text-align: right; }
    .more { margin-top: 16px; }
    .sk { height: 200px; }
    @keyframes rise { from { opacity: 0; transform: translateY(12px); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountOrders {
  private readonly api = inject(Api);
  protected readonly labels = ORDER_STATUS_LABEL;
  protected readonly tone = statusTone;
  protected readonly orders = signal<OrderSummary[]>([]);
  protected readonly page = signal(1);
  protected readonly pages = signal(1);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    this.load(1);
  }

  load(page: number): void {
    this.busy.set(true);
    this.api.orders(page).subscribe({
      next: (res) => {
        this.orders.update((list) => (page === 1 ? res.items : [...list, ...res.items]));
        this.page.set(res.page);
        this.pages.set(res.pages);
        this.loaded.set(true);
        this.busy.set(false);
      },
      error: () => {
        this.loaded.set(true);
        this.busy.set(false);
      },
    });
  }
}
