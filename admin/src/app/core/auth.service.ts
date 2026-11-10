import { HttpClient, HttpContext, HttpContextToken, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, firstValueFrom, map, of, shareReplay, catchError, tap } from 'rxjs';
import { API_BASE, API_PREFIX } from './api-base';
import { OtpRequestOut, TokenOut, UserOut } from './models';

/** Marks a request that must not trigger the refresh-and-retry logic (auth endpoints). */
export const SKIP_AUTH_REFRESH = new HttpContextToken<boolean>(() => false);

const SPA_HEADER = new HttpHeaders({ 'X-Requested-With': 'spuni' });

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = inject(API_BASE);

  /** Access token lives in memory only (never persisted). */
  private readonly _token = signal<string | null>(null);
  private readonly _user = signal<UserOut | null>(null);
  private refresh$: Observable<string | null> | null = null;
  private restored = false;

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token() && this._user()?.role === 'admin');

  private url(path: string): string {
    return `${this.base}${API_PREFIX}/admin/auth${path}`;
  }

  private ctx(): HttpContext {
    return new HttpContext().set(SKIP_AUTH_REFRESH, true);
  }

  requestOtp(email: string): Observable<OtpRequestOut> {
    return this.http.post<OtpRequestOut>(this.url('/otp/request'), { email }, { context: this.ctx() });
  }

  resendOtp(email: string): Observable<OtpRequestOut> {
    return this.http.post<OtpRequestOut>(this.url('/otp/resend'), { email }, { context: this.ctx() });
  }

  verifyOtp(email: string, code: string): Observable<TokenOut> {
    return this.http
      .post<TokenOut>(this.url('/otp/verify'), { email, code }, { context: this.ctx(), withCredentials: true })
      .pipe(tap((t) => this.setSession(t)));
  }

  /**
   * Exchange the httpOnly refresh cookie for a new access token. Concurrent callers share
   * one in-flight request. Emits the new token, or null when there is no valid session.
   */
  refresh(): Observable<string | null> {
    if (!this.refresh$) {
      this.refresh$ = this.http
        .post<TokenOut>(this.url('/refresh'), null, {
          headers: SPA_HEADER,
          withCredentials: true,
          context: this.ctx(),
        })
        .pipe(
          tap((t) => this.setSession(t)),
          map((t) => t.access_token as string | null),
          catchError(() => {
            this.clear();
            return of(null);
          }),
          finalize(() => (this.refresh$ = null)),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.refresh$;
  }

  /** Called by the guard: restores a session from the refresh cookie once per page load. */
  async ensureSession(): Promise<boolean> {
    if (this.isAuthenticated()) return true;
    if (this.restored) return false;
    this.restored = true;
    await firstValueFrom(this.refresh());
    return this.isAuthenticated();
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(this.url('/logout'), null, { headers: SPA_HEADER, withCredentials: true, context: this.ctx() }),
      );
    } catch {
      /* signing out locally is what matters */
    }
    this.clear();
    await this.router.navigate(['/login']);
  }

  /** Session expired and could not be refreshed. */
  sessionExpired(): void {
    this.clear();
    const returnUrl = this.router.url.startsWith('/login') ? undefined : this.router.url;
    void this.router.navigate(['/login'], { queryParams: returnUrl ? { returnUrl } : {} });
  }

  private setSession(t: TokenOut): void {
    if (t.user.role !== 'admin') {
      this.clear();
      return;
    }
    this._token.set(t.access_token);
    this._user.set(t.user);
    this.restored = true;
  }

  private clear(): void {
    this._token.set(null);
    this._user.set(null);
  }
}
