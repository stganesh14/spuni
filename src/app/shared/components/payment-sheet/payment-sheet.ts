import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';

import { MotionService } from '../../../core/motion/motion.service';
import { PaymentService } from '../../../core/payments/payment.service';
import { InrPipe } from '../../pipes/inr.pipe';

type Method = 'upi' | 'card' | 'netbanking';

/**
 * Test checkout used while the store runs in mock payment mode. It mirrors the
 * Razorpay sheet, and the server still verifies a signed result, so swapping
 * in live Razorpay keys changes nothing else in the flow.
 */
@Component({
  selector: 'app-payment-sheet',
  imports: [InrPipe],
  template: `
    @if (request(); as r) {
      <div class="scrim" (click)="answer(false)" aria-hidden="true"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ps-title" (keydown.escape)="answer(false)">
        <header>
          <div class="brand"><img src="/assets/logo.png" alt="" width="32" height="32" /><div>
            <b id="ps-title">{{ r.init.name }}</b><small>{{ r.init.description }}</small></div></div>
          <button type="button" class="icon-btn" (click)="answer(false)" aria-label="Cancel payment"><i class="bi bi-x-lg"></i></button>
        </header>
        <div class="amount"><small>Amount payable</small><strong>{{ r.init.amount_paise | inr }}</strong></div>
        <div class="tabs" role="tablist">
          @for (m of methods; track m.k) {
            <button type="button" role="tab" [class.on]="method() === m.k" [attr.aria-selected]="method() === m.k"
                    (click)="method.set(m.k)"><i class="bi" [class]="'bi ' + m.icon"></i> {{ m.label }}</button>
          }
        </div>
        <div class="body">
          @switch (method()) {
            @case ('upi') { <p>Pay with any UPI app: GPay, PhonePe, Paytm or BHIM.</p> }
            @case ('card') { <p>Visa, Mastercard, RuPay and Amex credit or debit cards.</p> }
            @default { <p>All major Indian banks.</p> }
          }
          <p class="test"><i class="bi bi-info-circle"></i> Test mode: no money moves. Real Razorpay switches on with live keys.</p>
        </div>
        <button type="button" class="btn btn-primary btn-block pay" (click)="answer(true)" [disabled]="processing()">
          @if (processing()) { <span class="spin"></span> Processing… } @else { Pay {{ r.init.amount_paise | inr }} }
        </button>
        <p class="secure"><i class="bi bi-shield-lock"></i> Secured by Razorpay</p>
      </div>
    }
  `,
  styles: `
    .scrim { position: fixed; inset: 0; z-index: 4500; background: rgba(20,10,6,.55); backdrop-filter: blur(4px);
      animation: fade .3s; }
    .sheet { position: fixed; z-index: 4501; left: 50%; bottom: 0; width: min(440px, 100%); transform: translateX(-50%);
      background: #fff; color: #1d1d1f; border-radius: 22px 22px 0 0; padding: 18px 20px 22px;
      box-shadow: 0 -20px 60px rgba(0,0,0,.35); animation: up .45s var(--ease-out); font-family: var(--font-sans); }
    @media (min-width: 600px) { .sheet { bottom: auto; top: 50%; transform: translate(-50%, -50%); border-radius: 22px;
      animation: pop .4s var(--ease-out); } }
    header { display: flex; justify-content: space-between; align-items: center; }
    .brand { display: flex; gap: 10px; align-items: center; }
    .brand div { display: grid; } .brand small { color: #6b6b70; font-size: .76rem; }
    .amount { margin: 16px 0; padding: 14px; border-radius: 14px; background: #f5f2ee; display: grid; }
    .amount small { color: #6b6b70; font-size: .72rem; } .amount strong { font-size: 1.6rem; }
    .tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .tabs button { padding: 10px 6px; border-radius: 12px; border: 1px solid #e3ded7; background: #fff; cursor: pointer;
      font-size: .78rem; display: grid; gap: 4px; justify-items: center; }
    .tabs button.on { border-color: var(--burgundy); background: rgba(100,31,31,.06); color: var(--burgundy); }
    .body { min-height: 86px; font-size: .86rem; color: #444; }
    .test { font-size: .74rem; color: #8a6d3b; background: #fbf4e4; padding: 8px 10px; border-radius: 10px; }
    .pay { margin-top: 6px; }
    .secure { text-align: center; font-size: .72rem; color: #6b6b70; margin: 10px 0 0; }
    @keyframes fade { from { opacity: 0; } }
    @keyframes up { from { transform: translate(-50%, 100%); } }
    @keyframes pop { from { opacity: 0; transform: translate(-50%, -46%) scale(.96); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentSheet {
  private readonly payments = inject(PaymentService);
  private readonly motion = inject(MotionService);
  protected readonly request = this.payments.mockSheet;
  protected readonly method = signal<Method>('upi');
  protected readonly processing = signal(false);
  protected readonly open = computed(() => this.request() !== null);
  protected readonly methods: { k: Method; label: string; icon: string }[] = [
    { k: 'upi', label: 'UPI', icon: 'bi-qr-code' },
    { k: 'card', label: 'Card', icon: 'bi-credit-card' },
    { k: 'netbanking', label: 'Net banking', icon: 'bi-bank' },
  ];

  constructor() {
    let wasOpen = false;
    effect(() => {
      const open = this.open();
      untracked(() => {
        if (open === wasOpen) return;
        wasOpen = open;
        if (open) {
          this.processing.set(false);
          this.motion.lockScroll();
        } else this.motion.unlockScroll();
      });
    });
  }

  answer(ok: boolean): void {
    const r = this.request();
    if (!r || this.processing()) return;
    if (ok) {
      this.processing.set(true);
      setTimeout(() => r.resolve(true), 900);
    } else r.resolve(false);
  }
}
