import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Api, apiErrorMessage } from '../api/api.service';
import { Order, PaymentInit } from '../api/models';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: (r: unknown) => void): void };
  }
}

export interface MockSheetRequest {
  init: PaymentInit;
  resolve: (ok: boolean) => void;
}

export class PaymentCancelled extends Error {
  constructor() {
    super('Payment was cancelled.');
  }
}

const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/**
 * Runs a payment for an order the server already created. The browser never
 * decides an order is paid: every result is verified by the API (HMAC
 * signature, and in Razorpay mode a server-to-server fetch of the payment).
 */
@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly api = inject(Api);
  private readonly document = inject(DOCUMENT);

  /** Drives the built-in test checkout sheet while Razorpay is in mock mode. */
  readonly mockSheet = signal<MockSheetRequest | null>(null);
  private scriptPromise?: Promise<void>;

  async pay(init: PaymentInit): Promise<Order> {
    if (!init.requires_payment) return firstValueFrom(this.api.order(init.order_number));
    return init.provider === 'razorpay' ? this.payWithRazorpay(init) : this.payWithMock(init);
  }

  private async payWithMock(init: PaymentInit): Promise<Order> {
    const confirmed = await new Promise<boolean>((resolve) => this.mockSheet.set({ init, resolve }));
    this.mockSheet.set(null);
    if (!confirmed) throw new PaymentCancelled();
    const result = await firstValueFrom(this.api.mockComplete(init.order_number, init.provider_order_id));
    return firstValueFrom(this.api.verifyPayment({ order_number: init.order_number, ...result }));
  }

  private async payWithRazorpay(init: PaymentInit): Promise<Order> {
    await this.loadScript();
    const Razorpay = window.Razorpay;
    if (!Razorpay || !init.key_id) throw new Error('The payment window could not load. Please try again.');

    const response = await new Promise<{ razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }>(
      (resolve, reject) => {
        const rzp = new Razorpay({
          key: init.key_id,
          order_id: init.provider_order_id,
          amount: init.amount_paise,
          currency: init.currency,
          name: init.name,
          description: init.description,
          image: `${this.document.location.origin}/assets/logo.png`,
          prefill: { email: init.prefill_email, name: init.prefill_name ?? '', contact: init.prefill_contact ?? '' },
          notes: { order_number: init.order_number },
          theme: { color: '#641f1f' },
          retry: { enabled: true, max_count: 3 },
          handler: resolve,
          modal: { ondismiss: () => reject(new PaymentCancelled()), confirm_close: true },
        });
        rzp.on('payment.failed', (r) => {
          const reason = (r as { error?: { description?: string } })?.error?.description ?? 'Payment failed';
          this.api.paymentFailed(init.order_number, init.provider_order_id, reason).subscribe({ error: () => undefined });
        });
        rzp.open();
      },
    );

    return firstValueFrom(
      this.api.verifyPayment({
        order_number: init.order_number,
        provider_order_id: response.razorpay_order_id,
        provider_payment_id: response.razorpay_payment_id,
        signature: response.razorpay_signature,
      }),
    );
  }

  private loadScript(): Promise<void> {
    if (window.Razorpay) return Promise.resolve();
    this.scriptPromise ??= new Promise<void>((resolve, reject) => {
      const script = this.document.createElement('script');
      script.src = RAZORPAY_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.scriptPromise = undefined;
        reject(new Error('Could not reach Razorpay. Check your connection and try again.'));
      };
      this.document.body.appendChild(script);
    });
    return this.scriptPromise;
  }
}

export function paymentErrorMessage(error: unknown): string {
  if (error instanceof PaymentCancelled) return 'Payment cancelled. Your order is saved; you can pay any time in the next 30 minutes.';
  if (error instanceof Error && !('status' in error)) return error.message;
  return apiErrorMessage(error, 'We could not confirm your payment. If money was taken, it will be refunded automatically.');
}
