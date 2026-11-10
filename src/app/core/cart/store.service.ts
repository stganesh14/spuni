import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, of, shareReplay, tap } from 'rxjs';

import { Api } from '../api/api.service';
import { Menu, StoreInfo } from '../api/models';
import { AuthService } from '../auth/auth.service';

/** Cached store-wide data: navigation menu, store rules and wallet balance. */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);

  readonly menu = signal<Menu | null>(null);
  readonly info = signal<StoreInfo | null>(null);
  readonly walletBalance = signal<number | null>(null);

  private menu$?: Observable<Menu | null>;
  private info$?: Observable<StoreInfo | null>;

  constructor() {
    this.auth.onLogin(() => this.refreshWallet());
  }

  loadMenu(): Observable<Menu | null> {
    this.menu$ ??= this.api.menu().pipe(
      tap((m) => this.menu.set(m)),
      catchError(() => of(null)),
      shareReplay(1),
    );
    return this.menu$;
  }

  loadInfo(): Observable<StoreInfo | null> {
    this.info$ ??= this.api.store().pipe(
      tap((i) => this.info.set(i)),
      catchError(() => of(null)),
      shareReplay(1),
    );
    return this.info$;
  }

  refreshWallet(): void {
    if (!this.auth.isLoggedIn()) {
      this.walletBalance.set(null);
      return;
    }
    this.api.wallet(true).subscribe({
      next: (w) => this.walletBalance.set(w.balance_paise),
      error: () => undefined,
    });
  }
}
