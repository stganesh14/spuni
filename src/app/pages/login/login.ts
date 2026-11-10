import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Api, apiErrorCode, apiErrorMessage } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/cart/cart.service';
import { ToastService } from '../../core/ui/toast.service';
import { OtpInput } from '../../shared/components/otp-input/otp-input';

type Step = 'email' | 'code' | 'name';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Passwordless sign-in: email, then a 6-digit code (with resend), then a name for new customers. */
@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink, OtpInput],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly cart = inject(CartService);
  private readonly otp = viewChild(OtpInput);

  readonly returnUrl = input<string | undefined>();

  protected readonly step = signal<Step>('email');
  protected email = '';
  protected fullName = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly codeInvalid = signal(false);
  protected readonly cooldown = signal(0);
  protected readonly expiresMinutes = signal(10);
  protected readonly cooldownLabel = computed(() => {
    const s = this.cooldown();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  protected readonly checkoutBound = computed(() => (this.returnUrl() ?? '').startsWith('/checkout'));

  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  submitEmail(): void {
    const email = this.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      this.error.set('Please enter a valid email address.');
      return;
    }
    this.email = email;
    this.send(false);
  }

  resend(): void {
    if (this.cooldown() > 0 || this.busy()) return;
    this.send(true);
  }

  verify(code: string): void {
    if (this.busy() || !/^\d{6}$/.test(code)) return;
    this.busy.set(true);
    this.error.set('');
    this.codeInvalid.set(false);
    this.auth.verify(this.email, code).subscribe({
      next: (res) => {
        this.busy.set(false);
        if (res.is_new_user || !res.user.full_name) {
          this.step.set('name');
        } else {
          this.finish(res.user.full_name);
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.codeInvalid.set(true);
        this.error.set(apiErrorMessage(err, 'That code did not work. Please try again.'));
        const code = apiErrorCode(err);
        if (code === 'otp_invalid' || code === 'otp_locked') this.otp()?.clear();
        setTimeout(() => this.codeInvalid.set(false), 600);
      },
    });
  }

  saveName(skip = false): void {
    const name = this.fullName.trim().replace(/\s+/g, ' ');
    if (skip || !name) {
      this.finish(null);
      return;
    }
    if (name.length < 2 || name.length > 120) {
      this.error.set('Please enter your name (2 to 120 characters).');
      return;
    }
    this.busy.set(true);
    this.api.updateMe({ full_name: name }).subscribe({
      next: (user) => {
        this.auth.setUser(user);
        this.finish(user.full_name);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  changeEmail(): void {
    this.step.set('email');
    this.error.set('');
    clearInterval(this.timer);
    this.cooldown.set(0);
  }

  private send(isResend: boolean): void {
    this.busy.set(true);
    this.error.set('');
    const call = isResend ? this.auth.resendOtp(this.email) : this.auth.requestOtp(this.email);
    call.subscribe({
      next: (res) => {
        this.busy.set(false);
        this.step.set('code');
        this.expiresMinutes.set(Math.max(1, Math.round(res.expires_in_seconds / 60)));
        this.startCooldown(res.resend_after_seconds);
        if (isResend) {
          this.otp()?.clear();
          this.toast.success('A fresh code is on its way. Earlier codes no longer work.');
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
        const retry = (err?.error?.error?.details as { retry_after?: number } | undefined)?.retry_after;
        if (retry && retry < 600 && this.step() === 'code') this.startCooldown(retry);
      },
    });
  }

  private startCooldown(seconds: number): void {
    clearInterval(this.timer);
    this.cooldown.set(Math.max(0, Math.ceil(seconds)));
    this.timer = setInterval(() => {
      const next = this.cooldown() - 1;
      this.cooldown.set(Math.max(0, next));
      if (next <= 0) clearInterval(this.timer);
    }, 1000);
  }

  private finish(name: string | null): void {
    this.busy.set(false);
    this.toast.success(name ? `Welcome, ${name.split(' ')[0]}.` : 'You are signed in.');
    const target = this.returnUrl();
    const safe = target && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/login') ? target : '/account';
    this.router.navigateByUrl(safe);
  }
}
