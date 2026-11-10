import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { gsap } from 'gsap';

import { Api, apiErrorMessage } from '../../core/api/api.service';
import { Order } from '../../core/api/models';
import { MotionService } from '../../core/motion/motion.service';
import { PaymentService, paymentErrorMessage } from '../../core/payments/payment.service';
import { SeoService } from '../../core/seo/seo.service';
import { ToastService } from '../../core/ui/toast.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { OrderView } from '../../shared/components/order-view/order-view';

@Component({
  selector: 'app-order-complete-page',
  imports: [RouterLink, OrderView, EmptyState],
  template: `
    <div class="page">
      <div class="container narrow">
        @if (order(); as o) {
          <header class="celebrate">
            <div class="burst" #burst aria-hidden="true"></div>
            <div class="seal" aria-hidden="true"><i class="bi" [class.bi-check2]="o.payment_status === 'paid'"
                                                   [class.bi-hourglass-split]="o.payment_status !== 'paid'"></i></div>
            @if (o.payment_status === 'paid') {
              <span class="eyebrow">Thank you{{ o.ship_name ? ', ' + o.ship_name.split(' ')[0] : '' }}</span>
              <h1 class="title">Your order is <em>confirmed.</em></h1>
              <p class="lead">We've emailed your receipt to {{ o.email }}. We'll write again the moment it ships.</p>
            } @else {
              <span class="eyebrow">Almost there</span>
              <h1 class="title">Waiting for <em>payment.</em></h1>
              <p class="lead">Complete the payment below to confirm your order.</p>
            }
            <div class="ctas">
              <a class="btn" routerLink="/account/orders">My orders</a>
              <a class="btn btn-ghost" routerLink="/shop">Keep shopping</a>
            </div>
          </header>
          <div class="panel"><app-order-view [order]="o" [busy]="busy()" (pay)="pay()" (cancel)="cancel($event)" /></div>
        } @else if (error()) {
          <app-empty-state icon="bi-receipt" title="We couldn't find that order" [text]="error()" actionLink="/account/orders"
                           actionLabel="See my orders" />
        } @else {
          <div class="skeleton sk"></div>
        }
      </div>
    </div>
  `,
  styles: `
    .narrow { max-width: 980px; }
    .celebrate { position: relative; text-align: center; display: grid; justify-items: center; gap: 10px;
      margin-bottom: 34px; }
    .celebrate .title { margin: 0; } .celebrate .lead { margin: 0; max-width: 52ch; }
    .seal { width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center; font-size: 2.6rem;
      background: var(--burgundy); color: var(--cream); box-shadow: 0 20px 40px -14px rgba(100,31,31,.7);
      animation: stamp .9s var(--ease-out) both; }
    @keyframes stamp { 0% { transform: scale(2.2) rotate(-20deg); opacity: 0; } 60% { transform: scale(.92); opacity: 1; } }
    .burst { position: absolute; left: 50%; top: 46px; width: 0; height: 0; pointer-events: none; }
    :host ::ng-deep .confetti { position: absolute; width: 10px; height: 14px; border-radius: 2px; }
    .ctas { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
    .panel { background: var(--paper); }
    .sk { height: 420px; border-radius: var(--radius-lg); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderCompletePage {
  private readonly api = inject(Api);
  private readonly payments = inject(PaymentService);
  private readonly toast = inject(ToastService);
  private readonly motion = inject(MotionService);
  private readonly burst = viewChild<ElementRef<HTMLElement>>('burst');

  readonly number = input.required<string>();
  readonly placed = input<string | undefined>();

  protected readonly order = signal<Order | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private celebrated = false;

  constructor() {
    inject(SeoService).set({ title: 'Thank you' });
    effect(() => {
      const number = this.number();
      untracked(() => this.load(number));
    });
    effect(() => {
      const el = this.burst()?.nativeElement;
      const o = this.order();
      if (!el || !o || o.payment_status !== 'paid' || this.celebrated || !this.placed()) return;
      this.celebrated = true;
      untracked(() => this.confetti(el));
    });
  }

  pay(): void {
    const o = this.order();
    if (!o) return;
    this.busy.set(true);
    this.api.retryPayment(o.number).subscribe({
      next: async (init) => {
        try {
          this.order.set(await this.payments.pay(init));
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

  cancel(reason: string | null): void {
    const o = this.order();
    if (!o) return;
    this.busy.set(true);
    this.api.cancelOrder(o.number, reason ?? undefined).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.order.set(updated);
        this.toast.success('Your order has been cancelled.');
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(err));
      },
    });
  }

  private load(number: string): void {
    this.api.order(number).subscribe({
      next: (o) => this.order.set(o),
      error: (err) => this.error.set(apiErrorMessage(err, 'It may belong to a different account.')),
    });
  }

  private confetti(host: HTMLElement): void {
    if (this.motion.reduced()) return;
    const colours = ['#641f1f', '#c9a66b', '#332016', '#8a2a24', '#eee3d2', '#6f7458'];
    for (let i = 0; i < 70; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti';
      piece.style.background = colours[i % colours.length];
      host.appendChild(piece);
      const angle = Math.random() * Math.PI * 2;
      const distance = 120 + Math.random() * 320;
      gsap.fromTo(piece, { x: 0, y: 0, rotate: 0, opacity: 1 }, {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance * 0.6 + 260,
        rotate: Math.random() * 720 - 360,
        opacity: 0,
        duration: 1.6 + Math.random() * 1.2,
        ease: 'power3.out',
        delay: 0.35,
        onComplete: () => piece.remove(),
      });
    }
  }
}
