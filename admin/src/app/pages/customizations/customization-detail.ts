import { Component, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { applyServerErrors, toApiError } from '../../core/errors';
import { formatBytes, humanize, nullIfBlank, paiseToRupees, rupeesToPaise } from '../../core/format';
import { CUSTOMIZATION_STATUSES, Customization, CustomizationStatus, CustomizationUpdateIn } from '../../core/models';
import { ToastService } from '../../core/ui.service';
import { rupees } from '../../core/validators';
import { DatePipe, HumanizePipe, MediaPipe, MoneyPipe } from '../../shared/pipes';
import { FieldComponent, PageHeader, StateComponent, StatusBadge } from '../../shared/ui';

@Component({
  selector: 'app-customization-detail',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, StateComponent, StatusBadge, FieldComponent, DatePipe, MoneyPipe, HumanizePipe, MediaPipe],
  templateUrl: './customization-detail.html',
})
export class CustomizationDetailPage {
  readonly reference = input.required<string>();
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);

  protected readonly statuses = CUSTOMIZATION_STATUSES.map((s) => ({ value: s, label: humanize(s) }));
  protected readonly item = signal<Customization | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly bytes = formatBytes;

  protected readonly form = new FormGroup({
    status: new FormControl<CustomizationStatus>('new', { nonNullable: true }),
    quote: new FormControl('', { nonNullable: true, validators: [rupees()] }),
    admin_notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(4000)] }),
    customer_visible_note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
    notify_customer: new FormControl(true, { nonNullable: true }),
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.set(await firstValueFrom(this.api.customization(this.reference())));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  private set(c: Customization): void {
    this.item.set(c);
    this.form.reset({
      status: c.status,
      quote: paiseToRupees(c.quoted_price_paise),
      admin_notes: c.admin_notes ?? '',
      customer_visible_note: c.customer_visible_note ?? '',
      notify_customer: true,
    });
  }

  protected isImage(type: string): boolean {
    return type.startsWith('image/');
  }

  protected async save(): Promise<void> {
    const c = this.item();
    if (!c) return;
    this.form.markAllAsTouched();
    this.formError.set(null);
    const v = this.form.getRawValue();
    const quote = rupeesToPaise(v.quote);
    if (v.status === 'quoted' && !quote) {
      this.form.controls.quote.setErrors({ server: 'Add the quoted price before marking as quoted.' });
      return;
    }
    if (this.form.invalid) return;
    const body: CustomizationUpdateIn = { notify_customer: v.notify_customer };
    if (v.status !== c.status) body.status = v.status;
    if (quote !== c.quoted_price_paise && quote !== null) body.quoted_price_paise = quote;
    if (nullIfBlank(v.admin_notes) !== c.admin_notes) body.admin_notes = nullIfBlank(v.admin_notes);
    if (nullIfBlank(v.customer_visible_note) !== c.customer_visible_note)
      body.customer_visible_note = nullIfBlank(v.customer_visible_note);
    if (Object.keys(body).length === 1) {
      this.toast.show('Nothing changed.', 'info');
      return;
    }
    this.saving.set(true);
    try {
      const updated = await firstValueFrom(this.api.updateCustomization(c.reference, body));
      this.set(updated);
      const emailed = body.status && v.notify_customer && updated.status !== 'new';
      this.toast.success(emailed ? 'Request updated and the customer was emailed.' : 'Request updated.');
    } catch (err) {
      const e = toApiError(err);
      if (e.status >= 500) {
        // The update may have been saved even though the response failed; show what the server has now.
        await this.load();
        this.formError.set(`${e.message} The latest saved state is shown below; check it before retrying.`);
        return;
      }
      applyServerErrors(this.form, e, { quoted_price_paise: 'quote' });
      this.formError.set(e.message);
    } finally {
      this.saving.set(false);
    }
  }
}
