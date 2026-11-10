import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, of, switchMap } from 'rxjs';

import { Api, apiErrorCode, apiErrorMessage } from '../../core/api/api.service';
import { Address, CheckoutRequest, PaymentInit, Quote } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/cart/cart.service';
import { StoreService } from '../../core/cart/store.service';
import { PaymentService, paymentErrorMessage } from '../../core/payments/payment.service';
import { SeoService } from '../../core/seo/seo.service';
import { ToastService } from '../../core/ui/toast.service';
import { newIdempotencyKey } from '../../core/utils/ids';
import { GIFT_INTENT_KEY, safeStorage } from '../../core/utils/storage';
import { AddressForm } from '../../shared/components/address-form/address-form';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { InrPipe } from '../../shared/pipes/inr.pipe';

const NAME = /^[A-Za-zÀ-ɏऀ-෿][A-Za-zÀ-ɏऀ-෿ .'-]{1,119}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

@Component({
  selector: 'app-checkout-page',
  imports: [FormsModule, RouterLink, InrPipe, AddressForm, EmptyState],
  templateUrl: './checkout.html',
  styleUrl: './checkout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly payments = inject(PaymentService);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);
  protected readonly store = inject(StoreService);
  private readonly addressForm = viewChild(AddressForm);

  protected readonly addresses = signal<Address[]>([]);
  protected readonly addressesLoaded = signal(false);
  protected readonly selectedAddress = signal<number | null>(null);
  protected readonly addingAddress = signal(false);
  protected saveAddress = true;

  protected readonly useWallet = signal(false);
  protected readonly isGift = signal(safeStorage.session(GIFT_INTENT_KEY) === '1');
  protected readonly giftWrap = signal(true);
  protected gift = { recipient_name: '', recipient_email: '', message: '', hide_prices: true };
  protected note = '';

  protected readonly placing = signal(false);
  protected readonly error = signal('');
  protected readonly pending = signal<PaymentInit | null>(null);
  private idempotencyKey = newIdempotencyKey();

  private readonly quoteInput = computed(() => ({
    lines: this.cart.lines(),
    useWallet: this.useWallet(),
    giftWrap: this.isGift() && this.giftWrap(),
  }));

  protected readonly quote = toSignal(
    toObservable(this.quoteInput).pipe(
      debounceTime(150),
      switchMap(({ lines, useWallet, giftWrap }) =>
        lines.length ? this.api.quote(lines, useWallet, giftWrap).pipe(catchError(() => of(null))) : of(null),
      ),
    ),
    { initialValue: null as Quote | null },
  );

  protected readonly walletBalance = computed(() => this.quote()?.wallet_balance_paise ?? 0);
  protected readonly needsNewAddress = computed(() => this.addingAddress() || (this.addressesLoaded() && !this.addresses().length));
  protected readonly giftWrapPrice = computed(() => this.store.info()?.gift_wrap_paise ?? 0);
  protected readonly maxRedeemPercent = computed(() => this.store.info()?.wallet_max_redeem_percent ?? 20);

  constructor() {
    inject(SeoService).set({ title: 'Checkout', path: '/checkout' });
    this.store.loadInfo().subscribe();
    this.api.addresses().subscribe({
      next: (list) => {
        this.addresses.set(list);
        this.selectedAddress.set((list.find((a) => a.is_default) ?? list[0])?.id ?? null);
        this.addressesLoaded.set(true);
      },
      error: () => this.addressesLoaded.set(true),
    });

    // Any change to what is being bought starts a fresh order attempt.
    effect(() => {
      this.cart.lines();
      untracked(() => {
        if (!this.pending()) this.idempotencyKey = newIdempotencyKey();
      });
    });
  }

  toggleGift(on: boolean): void {
    this.isGift.set(on);
  }

  async placeOrder(): Promise<void> {
    if (this.placing()) return;
    this.error.set('');
    const quote = this.quote();
    if (!quote || quote.has_issues) {
      this.error.set('Some items in your bag need attention before you can check out.');
      return;
    }

    const body: CheckoutRequest = {
      items: this.cart.lines(),
      save_address: this.saveAddress,
      use_wallet: this.useWallet(),
      note: this.note.trim() || null,
      idempotency_key: this.idempotencyKey,
    };

    if (this.needsNewAddress()) {
      const address = this.addressForm()?.value();
      if (!address) {
        this.error.set('Please complete your delivery address.');
        return;
      }
      body.address = address;
    } else if (this.selectedAddress()) {
      body.address_id = this.selectedAddress();
    } else {
      this.error.set('Choose where we should deliver.');
      return;
    }

    if (this.isGift()) {
      const name = this.gift.recipient_name.trim().replace(/\s+/g, ' ');
      const email = this.gift.recipient_email.trim().toLowerCase();
      if (!NAME.test(name)) {
        this.error.set("Please add the gift recipient's name.");
        return;
      }
      if (email && !EMAIL.test(email)) {
        this.error.set("The recipient's email doesn't look right.");
        return;
      }
      body.gift = {
        recipient_name: name,
        recipient_email: email || null,
        message: this.gift.message.trim() || null,
        gift_wrap: this.giftWrap(),
        hide_prices: this.gift.hide_prices,
      };
    }

    this.placing.set(true);
    this.api.checkout(body).subscribe({
      next: (init) => {
        this.pending.set(init);
        void this.runPayment(init);
      },
      error: (err) => {
        this.placing.set(false);
        this.error.set(apiErrorMessage(err, 'We could not place your order. Please try again.'));
        const code = apiErrorCode(err);
        if (code === 'order_expired' || code === 'order_not_payable') this.idempotencyKey = newIdempotencyKey();
      },
    });
  }

  retryPayment(): void {
    const pending = this.pending();
    if (!pending || this.placing()) return;
    this.placing.set(true);
    this.error.set('');
    this.api.retryPayment(pending.order_number).subscribe({
      next: (init) => {
        this.pending.set(init);
        void this.runPayment(init);
      },
      error: (err) => {
        this.placing.set(false);
        this.error.set(apiErrorMessage(err));
        const code = apiErrorCode(err);
        if (code === 'order_expired' || code === 'order_not_payable') {
          this.pending.set(null);
          this.idempotencyKey = newIdempotencyKey();
        }
      },
    });
  }

  private async runPayment(init: PaymentInit): Promise<void> {
    try {
      const order = await this.payments.pay(init);
      this.cart.clear();
      safeStorage.setSession(GIFT_INTENT_KEY, '');
      this.store.refreshWallet();
      this.pending.set(null);
      this.router.navigate(['/order', order.number], { queryParams: { placed: 1 } });
    } catch (err) {
      this.error.set(paymentErrorMessage(err));
      this.toast.error(paymentErrorMessage(err));
    } finally {
      this.placing.set(false);
    }
  }
}
