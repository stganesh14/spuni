import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { applyServerErrors, FieldError, toApiError } from '../../core/errors';
import { paiseToRupees, rupeesToPaise } from '../../core/format';
import { StoreSettings } from '../../core/models';
import { ToastService } from '../../core/ui.service';
import { intRange, PATTERNS, rupees } from '../../core/validators';
import { DatePipe } from '../../shared/pipes';
import { FieldComponent, PageHeader, StateComponent } from '../../shared/ui';

function giftRange(g: unknown): ValidationErrors | null {
  const group = g as FormGroup;
  const min = rupeesToPaise(group.get('gift_card_min')?.value);
  const max = rupeesToPaise(group.get('gift_card_max')?.value);
  const ctrl = group.get('gift_card_max');
  if (!ctrl) return null;
  const has = !!ctrl.errors?.['range'];
  if (min !== null && max !== null && max < min) {
    if (!has) ctrl.setErrors({ ...(ctrl.errors ?? {}), range: 'Maximum must be at least the minimum.' });
  } else if (has) {
    const { range: _, ...rest } = ctrl.errors ?? {};
    ctrl.setErrors(Object.keys(rest).length ? rest : null);
  }
  return null;
}

const ALIASES: Record<string, string> = {
  shipping_flat_paise: 'shipping_flat',
  free_shipping_threshold_paise: 'free_shipping_threshold',
  gift_wrap_paise: 'gift_wrap',
  gift_card_min_paise: 'gift_card_min',
  gift_card_max_paise: 'gift_card_max',
};

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, PageHeader, StateComponent, FieldComponent, DatePipe],
  templateUrl: './settings.html',
})
export class SettingsPage {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly unmatched = signal<FieldError[]>([]);
  protected readonly updatedAt = signal<string | null>(null);

  protected readonly form = new FormGroup(
    {
      wallet_earn_percent: new FormControl('', { nonNullable: true, validators: intRange(0, 50) }),
      wallet_max_redeem_percent: new FormControl('', { nonNullable: true, validators: intRange(0, 100) }),
      shipping_flat: new FormControl('', { nonNullable: true, validators: [rupees({ required: true, min: 0 })] }),
      free_shipping_threshold: new FormControl('', { nonNullable: true, validators: [rupees({ required: true, min: 0 })] }),
      gift_wrap: new FormControl('', { nonNullable: true, validators: [rupees({ required: true, min: 0 })] }),
      gift_card_min: new FormControl('', { nonNullable: true, validators: [rupees({ required: true })] }),
      gift_card_max: new FormControl('', { nonNullable: true, validators: [rupees({ required: true })] }),
      gift_card_validity_days: new FormControl('', { nonNullable: true, validators: intRange(30, 1825) }),
      support_email: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(254), Validators.pattern(PATTERNS.email)],
      }),
      support_phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(PATTERNS.phone)] }),
    },
    { validators: [giftRange] },
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.patch(await firstValueFrom(this.api.settings()));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  private patch(s: StoreSettings): void {
    this.form.reset({
      wallet_earn_percent: String(s.wallet_earn_percent),
      wallet_max_redeem_percent: String(s.wallet_max_redeem_percent),
      shipping_flat: paiseToRupees(s.shipping_flat_paise),
      free_shipping_threshold: paiseToRupees(s.free_shipping_threshold_paise),
      gift_wrap: paiseToRupees(s.gift_wrap_paise),
      gift_card_min: paiseToRupees(s.gift_card_min_paise),
      gift_card_max: paiseToRupees(s.gift_card_max_paise),
      gift_card_validity_days: String(s.gift_card_validity_days),
      support_email: s.support_email,
      support_phone: s.support_phone,
    });
    this.updatedAt.set(s.updated_at ?? null);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    this.formError.set(null);
    this.unmatched.set([]);
    if (this.form.invalid) {
      this.formError.set('Please fix the highlighted fields.');
      return;
    }
    const v = this.form.getRawValue();
    const body: StoreSettings = {
      wallet_earn_percent: Number(v.wallet_earn_percent),
      wallet_max_redeem_percent: Number(v.wallet_max_redeem_percent),
      shipping_flat_paise: rupeesToPaise(v.shipping_flat)!,
      free_shipping_threshold_paise: rupeesToPaise(v.free_shipping_threshold)!,
      gift_wrap_paise: rupeesToPaise(v.gift_wrap)!,
      gift_card_min_paise: rupeesToPaise(v.gift_card_min)!,
      gift_card_max_paise: rupeesToPaise(v.gift_card_max)!,
      gift_card_validity_days: Number(v.gift_card_validity_days),
      support_email: v.support_email.trim().toLowerCase(),
      support_phone: v.support_phone.replace(/[\s\-().]/g, ''),
    };
    this.saving.set(true);
    try {
      this.patch(await firstValueFrom(this.api.saveSettings(body)));
      this.toast.success('Store settings saved.');
    } catch (err) {
      const e = toApiError(err);
      this.unmatched.set(applyServerErrors(this.form, e, ALIASES).filter((f) => f.message));
      this.formError.set(e.message);
    } finally {
      this.saving.set(false);
    }
  }
}
