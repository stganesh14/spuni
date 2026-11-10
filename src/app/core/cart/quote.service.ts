import { Injectable, inject, signal } from '@angular/core';
import { Subject, debounceTime, of, switchMap, catchError, tap } from 'rxjs';

import { Api } from '../api/api.service';
import { Quote } from '../api/models';
import { CartService } from './cart.service';

/** Server-priced view of the bag, refreshed (debounced) whenever it changes. */
@Injectable({ providedIn: 'root' })
export class QuoteService {
  private readonly api = inject(Api);
  private readonly cart = inject(CartService);

  readonly quote = signal<Quote | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly trigger = new Subject<{ useWallet: boolean; giftWrap: boolean }>();

  constructor() {
    this.trigger
      .pipe(
        debounceTime(250),
        tap(() => this.loading.set(true)),
        switchMap(({ useWallet, giftWrap }) => {
          const lines = this.cart.lines();
          if (!lines.length) return of(null);
          return this.api.quote(lines, useWallet, giftWrap).pipe(
            catchError(() => {
              this.error.set('Could not refresh prices. Showing your last saved bag.');
              return of(undefined);
            }),
          );
        }),
      )
      .subscribe((quote) => {
        this.loading.set(false);
        if (quote === undefined) return;
        this.error.set(null);
        this.quote.set(quote);
        if (quote) this.cart.syncFromQuote(quote.lines);
      });
  }

  refresh(useWallet = false, giftWrap = false): void {
    this.trigger.next({ useWallet, giftWrap });
  }
}
