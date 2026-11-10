import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';

import { Api } from '../api/api.service';
import { TokenResponse, User } from '../api/models';
import { safeStorage } from '../utils/storage';

/** Non-secret hint that a refresh cookie probably exists, so guests skip the refresh call. */
const SESSION_HINT = 'spuni.session';

/**
 * Passwordless session state. The short-lived access token lives only in
 * memory; the refresh token is an httpOnly cookie the browser sends to
 * /api/v1/auth/refresh, so a page reload silently restores the session.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(Api);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly user = signal<User | null>(null);
  readonly accessToken = signal<string | null>(null);
  /** True once the initial silent refresh has finished (success or not). */
  readonly ready = signal(false);
  readonly isLoggedIn = computed(() => this.user() !== null);
  readonly firstName = computed(() => this.user()?.full_name?.split(' ')[0] ?? null);

  private refreshInFlight: Observable<string | null> | null = null;
  private readyPromise: Promise<void> | null = null;
  private loginListeners: ((user: User) => void)[] = [];

  /** Restore the session once at startup (browser only). */
  init(): Promise<void> {
    if (!this.isBrowser) {
      this.ready.set(true);
      return Promise.resolve();
    }
    if (!this.readyPromise && !safeStorage.get<boolean>(SESSION_HINT, false)) {
      this.ready.set(true);
      this.readyPromise = Promise.resolve();
    }
    if (!this.readyPromise) {
      this.readyPromise = new Promise<void>((resolve) => {
        this.refresh().subscribe({
          next: () => {
            this.ready.set(true);
            resolve();
          },
        });
      });
    }
    return this.readyPromise;
  }

  whenReady(): Promise<void> {
    return this.ready() ? Promise.resolve() : this.init();
  }

  onLogin(listener: (user: User) => void): void {
    this.loginListeners.push(listener);
  }

  /** Returns the new access token, or null if there is no valid session. */
  refresh(): Observable<string | null> {
    if (!this.isBrowser) return of(null);
    if (!this.refreshInFlight) {
      const hadUser = this.user() !== null;
      this.refreshInFlight = this.api.refresh().pipe(
        tap((res) => this.applySession(res, !hadUser)),
        map((res) => res.access_token),
        catchError(() => {
          this.clear();
          return of(null);
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay(1),
      );
    }
    return this.refreshInFlight;
  }

  requestOtp(email: string) {
    return this.api.requestOtp(email);
  }

  resendOtp(email: string) {
    return this.api.resendOtp(email);
  }

  verify(email: string, code: string, fullName?: string | null): Observable<TokenResponse> {
    return this.api.verifyOtp(email, code, fullName).pipe(tap((res) => this.applySession(res, true)));
  }

  setUser(user: User): void {
    this.user.set(user);
  }

  logout(): Observable<unknown> {
    return this.api.logout().pipe(
      catchError(() => of(null)),
      tap(() => this.clear()),
    );
  }

  clear(): void {
    this.user.set(null);
    this.accessToken.set(null);
    if (this.isBrowser) safeStorage.remove(SESSION_HINT);
  }

  private applySession(res: TokenResponse, notify: boolean): void {
    this.accessToken.set(res.access_token);
    this.user.set(res.user);
    if (this.isBrowser) safeStorage.set(SESSION_HINT, true);
    if (notify) for (const listener of this.loginListeners) listener(res.user);
  }
}
