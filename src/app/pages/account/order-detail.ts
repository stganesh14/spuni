import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Api, apiErrorMessage } from '../../core/api/api.service';
import { Order } from '../../core/api/models';
import { StoreService } from '../../core/cart/store.service';
import { PaymentService, paymentErrorMessage } from '../../core/payments/payment.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { OrderView } from '../../shared/components/order-view/order-view';

@Component({
  selector: 'app-account-order-detail',
  imports: [RouterLink, OrderView, EmptyState],
  template: `
    <a class="link-arrow back" routerLink="/account/orders"><i class="bi bi-arrow-left"></i> All orders</a>
    @if (order(); as o) {
      <div class="panel"><app-order-view [order]="o" [busy]="busy()" (cancel)="cancel($event)" (pay)="pay()" /></div>
    } @else if (error()) {
      <app-empty-state icon="bi-receipt" title="Order not found" [text]="error()" actionLink="/account/orders" actionLabel="Back to orders" />
    } @else {
      <div class="skeleton sk"></div>
    }
  `,
  styles: `
    .back { display: inline-flex; margin-bottom: 14px; }
    .panel { background: var(--paper); }
    .sk { height: 420px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountOrderDetail {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly payments = inject(PaymentService);
  private readonly store = inject(StoreService);
  readonly number = input.required<string>();
  protected readonly order = signal<Order | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const n = this.number();
      untracked(() =>
        this.api.order(n).subscribe({
          next: (o) => this.order.set(o),
          error: (err) => this.error.set(apiErrorMessage(err, 'We could not find this order on your account.')),
        }),
      );
    });
  }

  cancel(reason: string | null): void {
    this.busy.set(true);
    this.api.cancelOrder(this.number(), reason ?? undefined).subscribe({
      next: (o) => {
        this.order.set(o);
        this.busy.set(false);
        this.store.refreshWallet();
        this.toast.success('Order cancelled. Any payment will be refunded within 5 to 7 working days.');
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(err));
      },
    });
  }

  pay(): void {
    this.busy.set(true);
    this.api.retryPayment(this.number()).subscribe({
      next: async (init) => {
        try {
          this.order.set(await this.payments.pay(init));
          this.store.refreshWallet();
          this.toast.success('Payment received. Your order is confirmed.');
        } catch (err) {
          this.toast.error(paymentErrorMessage(err));
        } finally {
          this.busy.set(false);
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(err));
      },
    });
  }
}
