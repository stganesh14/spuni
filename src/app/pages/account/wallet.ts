import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Api, apiErrorMessage } from '../../core/api/api.service';
import { Wallet } from '../../core/api/models';
import { StoreService } from '../../core/cart/store.service';
import { ToastService } from '../../core/ui/toast.service';
import { WALLET_REASON_LABEL } from '../../core/utils/labels';
import { InrPipe } from '../../shared/pipes/inr.pipe';
import { SpuniCashPipe } from '../../shared/pipes/spuni-cash.pipe';

@Component({
  selector: 'app-account-wallet',
  imports: [FormsModule, RouterLink, DatePipe, InrPipe, SpuniCashPipe],
  template: `
    <section class="hero-card">
      <div class="coin" aria-hidden="true">S</div>
      <small>Available balance</small>
      <strong>{{ (wallet()?.balance_paise ?? 0) | spuniCash:cashValuePaise() }}</strong>
      <p>Lifetime earned {{ (wallet()?.lifetime_earned_paise ?? 0) | spuniCash:cashValuePaise() }}</p>
      <p>1 Spuni Cash = {{ cashValuePaise() | inr }}</p>
      <div class="how">
        <span><i class="bi bi-bag-check"></i> Earn {{ earnRange() }}% based on order value</span>
        <span><i class="bi bi-cash-coin"></i> Use up to {{ wallet()?.max_redeem_percent ?? 20 }}% on your next one</span>
        <span><i class="bi bi-gift"></i> Gift cards land here too</span>
      </div>
    </section>

    <section class="panel redeem">
      <h2>Redeem a gift card</h2>
      <form (ngSubmit)="redeem()" class="row" novalidate>
        <label class="sr-only" for="gc-code">Gift card code</label>
        <input id="gc-code" class="input" name="code" [(ngModel)]="code" placeholder="SPUNI-XXXX-XXXX-XXXX"
               autocomplete="off" maxlength="24" spellcheck="false" />
        <button class="btn btn-primary" type="submit" [disabled]="busy()">@if (busy()) { <span class="spin"></span> } Redeem</button>
      </form>
      @if (error()) { <p class="alert error" role="alert">{{ error() }}</p> }
    </section>

    <section class="panel">
      <h2>Activity</h2>
      @for (t of wallet()?.transactions ?? []; track t.id) {
        <div class="txn">
          <i class="bi" [class.bi-arrow-down-left]="t.type === 'credit'" [class.bi-arrow-up-right]="t.type === 'debit'"
             [class.credit]="t.type === 'credit'"></i>
          <span class="meta"><b>{{ reasons[t.reason] || t.reason }}</b>
            <small>{{ t.created_at | date: 'd MMM y' }}@if (t.order_number) { · <a [routerLink]="['/account/orders', t.order_number]">{{ t.order_number }}</a> }</small></span>
          <b [class.credit]="t.type === 'credit'">{{ t.type === 'credit' ? '+' : '−' }}{{ t.amount_paise | spuniCash:cashValuePaise() }}</b>
        </div>
      } @empty {
        <p class="muted">No activity yet. Your first order earns points automatically.</p>
      }
    </section>
  `,
  styles: `
    .hero-card { position: relative; overflow: hidden; display: grid; gap: 4px; padding: 28px; border-radius: 22px;
      margin-bottom: 18px; color: var(--cream);
      background: radial-gradient(120% 140% at 100% 0%, #8a2a24 0%, #3a1d14 60%, #24120c 100%); box-shadow: var(--shadow-lift); }
    .hero-card small { font-family: var(--font-mono); font-size: .62rem; letter-spacing: .22em; text-transform: uppercase; opacity: .8; }
    .hero-card strong { font-family: var(--font-display); font-weight: 400; font-size: clamp(2.6rem, 7vw, 4rem); line-height: 1; }
    .hero-card p { margin: 0 0 12px; opacity: .8; }
    .how { display: flex; flex-wrap: wrap; gap: 8px; }
    .how span { padding: 6px 12px; border-radius: 999px; background: rgba(238,227,210,.12); font-size: .78rem; }
    .coin { position: absolute; right: 24px; top: 20px; width: 70px; height: 70px; border-radius: 50%;
      display: grid; place-items: center; font-family: var(--font-display); font-size: 2rem; color: #3a1d14;
      background: radial-gradient(circle at 30% 30%, #f1d9a3, #c9a66b 60%, #8a6a3e); animation: spin3d 6s linear infinite; }
    @keyframes spin3d { to { transform: rotateY(360deg); } }
    .panel { background: var(--paper); margin-bottom: 18px; }
    h2 { margin: 0 0 12px; font-family: var(--font-display); font-weight: 400; font-size: 1.35rem; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; } .row .input { flex: 1 1 220px; text-transform: uppercase; font-family: var(--font-mono); }
    .redeem .alert { margin-top: 12px; }
    .txn { display: grid; grid-template-columns: 36px 1fr auto; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid var(--line); }
    .txn > i { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--cream); }
    .meta { display: grid; } .meta small { color: var(--muted); }
    .credit { color: var(--success); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountWallet {
  private readonly api = inject(Api);
  private readonly store = inject(StoreService);
  private readonly toast = inject(ToastService);
  protected readonly reasons = WALLET_REASON_LABEL;
  protected readonly wallet = signal<Wallet | null>(null);
  protected readonly cashValuePaise = computed(() => this.store.info()?.wallet_cash_value_paise ?? 100);
  protected readonly earnRange = computed(() => {
    const info = this.store.info();
    if (!info) return '2–5';
    const rates = [
      info.wallet_tier_1_percent,
      info.wallet_tier_2_percent,
      info.wallet_tier_3_percent,
      info.wallet_tier_4_percent,
    ];
    return `${Math.min(...rates)}–${Math.max(...rates)}`;
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected code = '';

  constructor() {
    this.store.loadInfo().subscribe();
    this.load();
  }

  redeem(): void {
    const code = this.code.trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9-]{12,24}$/.test(code)) {
      this.error.set('Enter the code exactly as it appears in your gift email.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api.redeemGiftCard(code).subscribe({
      next: (card) => {
        this.busy.set(false);
        this.code = '';
        this.toast.success(`Gift card from ${card.sender_name} added to your wallet.`);
        this.load();
        this.store.refreshWallet();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  private load(): void {
    this.api.wallet().subscribe({ next: (w) => this.wallet.set(w), error: () => undefined });
  }
}
