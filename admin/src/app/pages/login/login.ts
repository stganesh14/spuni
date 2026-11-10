import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChildren } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { retryAfter, toApiError } from '../../core/errors';
import { PATTERNS } from '../../core/validators';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly step = signal<'email' | 'code'>('email');
  protected readonly email = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(254), Validators.pattern(PATTERNS.email)],
  });
  protected readonly digits = signal<string[]>(['', '', '', '', '', '']);
  protected readonly code = computed(() => this.digits().join(''));
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);
  protected readonly cooldown = signal(0);
  protected readonly sentTo = signal('');
  private readonly inputs = viewChildren<ElementRef<HTMLInputElement>>('digit');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopTimer());
  }

  protected async sendCode(): Promise<void> {
    this.email.markAsTouched();
    if (this.email.invalid || this.busy()) return;
    const email = this.email.value.trim().toLowerCase();
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.auth.requestOtp(email));
      this.sentTo.set(email);
      this.info.set(res.message);
      this.startCooldown(res.resend_after_seconds);
      this.goToCode();
    } catch (err) {
      const e = toApiError(err);
      const wait = retryAfter(e);
      if (e.status === 429 && wait !== null && e.code === 'otp_cooldown') {
        // A code was sent very recently: let the admin enter it.
        this.sentTo.set(email);
        this.info.set('A code was sent recently. Enter it below, or resend when the timer ends.');
        this.startCooldown(wait);
        this.goToCode();
      } else {
        this.error.set(e.fields[0]?.message ?? e.message);
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async resend(): Promise<void> {
    if (this.cooldown() > 0 || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.auth.resendOtp(this.sentTo()));
      this.info.set('A fresh code is on its way. Earlier codes no longer work.');
      this.startCooldown(res.resend_after_seconds);
      this.clearDigits();
    } catch (err) {
      const e = toApiError(err);
      const wait = retryAfter(e);
      if (wait !== null) this.startCooldown(wait);
      this.error.set(e.message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async verify(): Promise<void> {
    const code = this.code();
    if (!/^\d{6}$/.test(code) || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.auth.verifyOtp(this.sentTo(), code));
      if (!this.auth.isAuthenticated()) {
        this.error.set('This account does not have admin access.');
        return;
      }
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const safe = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';
      await this.router.navigateByUrl(safe);
    } catch (err) {
      const e = toApiError(err);
      this.error.set(e.message);
      this.clearDigits();
    } finally {
      this.busy.set(false);
    }
  }

  protected useDifferentEmail(): void {
    this.step.set('email');
    this.error.set(null);
    this.info.set(null);
    this.clearDigits(false);
    this.stopTimer();
    this.cooldown.set(0);
    setTimeout(() => document.getElementById('login-email')?.focus());
  }

  // ------------------------------------------------------------ OTP inputs

  protected onDigitInput(i: number, e: Event): void {
    const el = e.target as HTMLInputElement;
    const raw = el.value.replace(/\D/g, '');
    if (raw.length > 1) {
      this.fill(raw, i);
      return;
    }
    this.setDigit(i, raw);
    el.value = raw;
    if (raw && i < 5) this.focus(i + 1);
    if (this.code().length === 6) void this.verify();
  }

  protected onDigitKey(i: number, e: KeyboardEvent): void {
    const el = e.target as HTMLInputElement;
    if (e.key === 'Backspace' && !el.value && i > 0) {
      e.preventDefault();
      this.setDigit(i - 1, '');
      this.focus(i - 1);
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      this.focus(i - 1);
    } else if (e.key === 'ArrowRight' && i < 5) {
      e.preventDefault();
      this.focus(i + 1);
    } else if (e.key === 'Enter') {
      void this.verify();
    }
  }

  protected onPaste(i: number, e: ClipboardEvent): void {
    const text = e.clipboardData?.getData('text') ?? '';
    const digits = text.replace(/\D/g, '');
    if (!digits) return;
    e.preventDefault();
    this.fill(digits, i);
  }

  private fill(digits: string, start: number): void {
    const next = [...this.digits()];
    const src = digits.length >= 6 ? digits.slice(0, 6) : digits;
    const from = digits.length >= 6 ? 0 : start;
    for (let k = 0; k < src.length && from + k < 6; k++) next[from + k] = src[k]!;
    this.digits.set(next);
    this.syncInputs();
    const firstEmpty = next.findIndex((d) => !d);
    this.focus(firstEmpty === -1 ? 5 : firstEmpty);
    if (this.code().length === 6) void this.verify();
  }

  private setDigit(i: number, d: string): void {
    this.digits.update((list) => list.map((v, k) => (k === i ? d : v)));
  }

  private clearDigits(focus = true): void {
    this.digits.set(['', '', '', '', '', '']);
    this.syncInputs();
    if (focus) this.focus(0, true);
  }

  private syncInputs(): void {
    const list = this.digits();
    this.inputs().forEach((ref, k) => (ref.nativeElement.value = list[k] ?? ''));
  }

  private focus(i: number, defer = false): void {
    const run = () => {
      const el = this.inputs()[i]?.nativeElement;
      el?.focus();
      el?.select();
    };
    if (defer) setTimeout(run, 30);
    else run();
  }

  private goToCode(): void {
    this.step.set('code');
    this.clearDigits();
  }

  private startCooldown(seconds: number): void {
    this.stopTimer();
    this.cooldown.set(Math.max(0, Math.ceil(seconds)));
    this.timer = setInterval(() => {
      this.cooldown.update((s) => Math.max(0, s - 1));
      if (this.cooldown() === 0) this.stopTimer();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
