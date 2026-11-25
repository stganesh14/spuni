import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Api, apiErrorMessage } from '../api/api.service';
import { Order, PaymentInit } from '../api/models';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: (r: unknown) => void): void };
  }
}

export class PaymentCancelled extends Error {
  constructor() {
    super('Payment was cancelled.');
  }
}

const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayPaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

function isRazorpayPaymentResponse(value: unknown): value is RazorpayPaymentResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Record<string, unknown>;
  return typeof response['razorpay_order_id'] === 'string'
    && typeof response['razorpay_payment_id'] === 'string'
    && typeof response['razorpay_signature'] === 'string';
}

/**
 * Runs a payment for an order the server already created. The browser never
 * decides an order is paid: every result is verified by the API (HMAC
 * signature, and in Razorpay mode a server-to-server fetch of the payment).
 */
@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly api = inject(Api);
  private readonly document = inject(DOCUMENT);

  private scriptPromise?: Promise<void>;

  async pay(init: PaymentInit): Promise<Order> {
    if (!init.requires_payment) return firstValueFrom(this.api.order(init.order_number));
    return this.payWithRazorpay(init);
  }

  private async payWithRazorpay(init: PaymentInit): Promise<Order> {
    await this.loadScript();
    const Razorpay = window.Razorpay;
    if (!Razorpay || !init.key_id) throw new Error('The payment window could not load. Please try again.');

    const response = await new Promise<RazorpayPaymentResponse>((resolve, reject) => {
      let settled = false;
      let lastFailure: string | null = null;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
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
        handler: (result: unknown) => {
          if (settled) return;
          if (!isRazorpayPaymentResponse(result)) {
            fail(new Error('Razorpay returned an invalid payment response.'));
            return;
          }
          settled = true;
          resolve(result);
        },
        modal: {
          ondismiss: () => fail(lastFailure ? new Error(lastFailure) : new PaymentCancelled()),
          confirm_close: true,
        },
      });
      rzp.on('payment.failed', (r) => {
        const event = r && typeof r === 'object' ? r as Record<string, unknown> : {};
        const error = event['error'] && typeof event['error'] === 'object'
          ? event['error'] as Record<string, unknown>
          : {};
        const metadata = error['metadata'] && typeof error['metadata'] === 'object'
          ? error['metadata'] as Record<string, unknown>
          : {};
        const reason = typeof error['description'] === 'string' ? error['description'] : 'Payment was not completed.';
        lastFailure = reason;
        const errorCode = typeof error['code'] === 'string' ? error['code'] : undefined;
        const paymentId = typeof metadata['payment_id'] === 'string' ? metadata['payment_id'] : undefined;
        this.api.paymentFailed(init.order_number, init.provider_order_id, reason, errorCode, paymentId).subscribe({
          error: () => console.warn('Could not report the payment failure; Razorpay webhook reconciliation remains enabled.'),
        });
      });
      rzp.open();
    });

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
  return apiErrorMessage(
    error,
    'We could not confirm your payment. Check your order status before trying again; contact support if money was debited.',
  );
}
