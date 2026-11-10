import { Component, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { applyServerErrors, toApiError } from '../../core/errors';
import { formatPaise, rupeesToPaise } from '../../core/format';
import { CustomerDetail } from '../../core/models';
import { ConfirmService, ToastService } from '../../core/ui.service';
import { rupees } from '../../core/validators';
import { DatePipe, HumanizePipe, MoneyPipe } from '../../shared/pipes';
import { FieldComponent, PageHeader, StateComponent, StatusBadge } from '../../shared/ui';

@Component({
  selector: 'app-customer-detail',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, StateComponent, StatusBadge, FieldComponent, MoneyPipe, DatePipe, HumanizePipe],
  templateUrl: './customer-detail.html',
})
export class CustomerDetailPage {
  readonly id = input.required<string>();
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly data = signal<CustomerDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly isSelf = computed(() => this.data()?.customer.id === this.auth.user()?.id);

  protected readonly wallet = new FormGroup({
    direction: new FormControl<'credit' | 'debit'>('credit', { nonNullable: true }),
    amount: new FormControl('', { nonNullable: true, validators: [rupees({ required: true })] }),
    note: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3), Validators.maxLength(300)] }),
    notify_customer: new FormControl(true, { nonNullable: true }),
  });
  protected readonly adjusting = signal(false);
  protected readonly walletError = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await firstValueFrom(this.api.customer(Number(this.id()))));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async toggleActive(): Promise<void> {
    const c = this.data()?.customer;
    if (!c) return;
    const next = !c.is_active;
    const ok = await this.confirm.ask({
      title: next ? 'Reactivate account?' : 'Deactivate account?',
      message: next
        ? `${c.email} will be able to sign in again.`
        : `${c.email} will be signed out everywhere and cannot sign in until reactivated. Orders are kept.`,
      confirmText: next ? 'Reactivate' : 'Deactivate',
      danger: !next,
    });
    if (!ok) return;
    await this.patch({ is_active: next }, next ? 'Account reactivated.' : 'Account deactivated.');
  }

  protected async changeRole(role: 'customer' | 'admin'): Promise<void> {
    const c = this.data()?.customer;
    if (!c || c.role === role) return;
    const ok = await this.confirm.ask({
      title: role === 'admin' ? 'Grant admin access?' : 'Remove admin access?',
      message:
        role === 'admin'
          ? `${c.email} will be able to sign in to this admin panel and manage the whole store.`
          : `${c.email} will lose access to the admin panel and be signed out.`,
      confirmText: role === 'admin' ? 'Make admin' : 'Make customer',
      danger: role === 'admin',
    });
    if (!ok) return;
    await this.patch({ role }, role === 'admin' ? 'Admin access granted.' : 'Admin access removed.');
  }

  private async patch(body: { is_active?: boolean; role?: 'customer' | 'admin' }, msg: string): Promise<void> {
    const c = this.data()?.customer;
    if (!c) return;
    this.busy.set(true);
    try {
      const updated = await firstValueFrom(this.api.updateCustomer(c.id, body));
      // PATCH returns the row without aggregate stats; keep the ones we have.
      this.data.update((d) =>
        d ? { ...d, customer: { ...d.customer, is_active: updated.is_active, role: updated.role } } : d,
      );
      this.toast.success(msg);
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async adjustWallet(): Promise<void> {
    const c = this.data()?.customer;
    if (!c) return;
    this.wallet.markAllAsTouched();
    if (this.wallet.invalid) return;
    const v = this.wallet.getRawValue();
    const amount = rupeesToPaise(v.amount)!;
    if (v.direction === 'debit' && amount > (this.data()?.wallet.balance_paise ?? 0)) {
      this.walletError.set(`The wallet only has ${formatPaise(this.data()?.wallet.balance_paise ?? 0)}.`);
      return;
    }
    const ok = await this.confirm.ask({
      title: v.direction === 'credit' ? 'Credit wallet?' : 'Debit wallet?',
      message: `${v.direction === 'credit' ? 'Add' : 'Remove'} ${formatPaise(amount)} ${v.direction === 'credit' ? 'to' : 'from'} ${c.email}'s wallet.\nReason: ${v.note}`,
      confirmText: v.direction === 'credit' ? 'Credit' : 'Debit',
      danger: v.direction === 'debit',
    });
    if (!ok) return;
    this.adjusting.set(true);
    this.walletError.set(null);
    try {
      const res = await firstValueFrom(
        this.api.adjustWallet(c.id, { direction: v.direction, amount_paise: amount, note: v.note.trim(), notify_customer: v.notify_customer }),
      );
      this.toast.success(`Wallet ${v.direction === 'credit' ? 'credited' : 'debited'}. New balance ${formatPaise(res.balance_paise)}.`);
      this.wallet.reset({ direction: v.direction, amount: '', note: '', notify_customer: true });
      void this.load();
    } catch (err) {
      const e = toApiError(err);
      applyServerErrors(this.wallet, e, { amount_paise: 'amount' });
      this.walletError.set(e.message);
    } finally {
      this.adjusting.set(false);
    }
  }
}
