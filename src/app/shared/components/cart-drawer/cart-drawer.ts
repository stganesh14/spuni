import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { gsap } from 'gsap';

import { CartService, MAX_QTY } from '../../../core/cart/cart.service';
import { QuoteService } from '../../../core/cart/quote.service';
import { MotionService } from '../../../core/motion/motion.service';
import { InrPipe } from '../../pipes/inr.pipe';

@Component({
  selector: 'app-cart-drawer',
  imports: [RouterLink, InrPipe],
  templateUrl: './cart-drawer.html',
  styleUrl: './cart-drawer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartDrawer {
  protected readonly cart = inject(CartService);
  protected readonly quotes = inject(QuoteService);
  private readonly motion = inject(MotionService);
  private readonly router = inject(Router);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  protected readonly maxQty = MAX_QTY;

  protected readonly quote = this.quotes.quote;
  protected readonly issues = computed(() => new Map((this.quote()?.lines ?? []).map((l) => [l.product_id, l])));
  protected readonly subtotal = computed(() => this.quote()?.subtotal_paise ?? this.cart.subtotalHint());
  protected readonly threshold = computed(() => this.quote()?.free_shipping_threshold_paise ?? 0);
  protected readonly toFree = computed(() => Math.max(0, this.threshold() - this.subtotal()));
  protected readonly freeProgress = computed(() =>
    this.threshold() ? Math.min(100, (this.subtotal() / this.threshold()) * 100) : 100,
  );

  constructor() {
    effect(() => {
      const open = this.cart.drawerOpen();
      this.cart.items();
      untracked(() => {
        if (open) this.quotes.refresh();
      });
    });
    effect(() => {
      const open = this.cart.drawerOpen();
      untracked(() => {
        if (open) {
          this.motion.lockScroll();
          requestAnimationFrame(() => this.animateIn());
        }
      });
    });
    this.router.events.subscribe(() => {
      if (this.cart.drawerOpen()) this.close();
    });
  }

  close(): void {
    if (!this.cart.drawerOpen()) return;
    this.cart.drawerOpen.set(false);
    this.motion.unlockScroll();
  }

  qty(productId: number, value: number): void {
    this.cart.setQuantity(productId, value);
  }

  private animateIn(): void {
    const panel = this.panel()?.nativeElement;
    if (!panel || this.motion.reduced()) return;
    gsap.fromTo(panel.querySelectorAll('.line'), { x: 40, opacity: 0 }, {
      x: 0, opacity: 1, duration: 0.6, stagger: 0.06, ease: 'power3.out', delay: 0.15,
    });
  }
}
