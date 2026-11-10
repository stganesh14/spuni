import { Component, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { applyServerErrors, toApiError } from '../../core/errors';
import { formatPaise, humanize, nullIfBlank, orderActionLabel } from '../../core/format';
import { Order, OrderStatus } from '../../core/models';
import { ConfirmService, ToastService } from '../../core/ui.service';
import { PATTERNS } from '../../core/validators';
import { DatePipe, HumanizePipe, MediaPipe, MoneyPipe } from '../../shared/pipes';
import { FieldComponent, PageHeader, StateComponent, StatusBadge } from '../../shared/ui';

@Component({
  selector: 'app-order-detail',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, StateComponent, StatusBadge, FieldComponent, MoneyPipe, DatePipe, MediaPipe, HumanizePipe],
  templateUrl: './order-detail.html',
})
export class OrderDetailPage {
  readonly number = input.required<string>();
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);

  protected readonly order = signal<Order | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly statusForm = new FormGroup({
    status: new FormControl<OrderStatus | null>(null, { validators: [Validators.required] }),
    courier: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(60)] }),
    tracking_number: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(60), Validators.pattern(PATTERNS.tracking)] }),
    tracking_url: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(300), Validators.pattern(PATTERNS.httpsUrl)] }),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    notify_customer: new FormControl(true, { nonNullable: true }),
  });
  protected readonly chosen = signal<OrderStatus | null>(null);
  protected readonly updating = signal(false);
  protected readonly statusError = signal<string | null>(null);

  protected readonly note = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(4000)] });
  protected readonly savingNote = signal(false);

  protected readonly address = computed(() => {
    const o = this.order();
    if (!o || !o.ship_line1) return null;
    return [o.ship_line1, o.ship_line2, o.ship_landmark, [o.ship_city, o.ship_state].filter(Boolean).join(', '), o.ship_postal_code]
      .filter((x) => !!x)
      .join('\n');
  });
  protected readonly isDestructive = computed(() => this.chosen() === 'cancelled' || this.chosen() === 'refunded');

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.setOrder(await firstValueFrom(this.api.order(this.number())));
      this.preselectFromLink();
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  private setOrder(o: Order): void {
    this.order.set(o);
    this.note.reset(o.admin_note ?? '');
    this.statusForm.reset({
      status: null,
      courier: o.courier ?? '',
      tracking_number: o.tracking_number ?? '',
      tracking_url: o.tracking_url ?? '',
      note: '',
      notify_customer: true,
    });
    this.chosen.set(null);
    this.statusError.set(null);
  }

  protected choose(s: OrderStatus): void {
    this.chosen.set(s);
    this.statusForm.controls.status.setValue(s);
    const c = this.statusForm.controls;
    const shipping = s === 'shipped';
    c.courier.setValidators(shipping ? [Validators.required, Validators.maxLength(60)] : [Validators.maxLength(60)]);
    c.tracking_number.setValidators(
      shipping ? [Validators.required, Validators.maxLength(60), Validators.pattern(PATTERNS.tracking)] : [Validators.maxLength(60), Validators.pattern(PATTERNS.tracking)],
    );
    c.courier.updateValueAndValidity();
    c.tracking_number.updateValueAndValidity();
    this.statusError.set(null);
  }

  /** Allowed next statuses, forward moves first and destructive ones last. */
  protected transitions(o: Order): OrderStatus[] {
    const rank = (s: OrderStatus) => (s === 'cancelled' || s === 'refunded' ? 1 : 0);
    return [...o.allowed_transitions].sort((a, b) => rank(a) - rank(b));
  }

  protected label(s: string): string {
    return orderActionLabel(s);
  }

  /** The orders list links here with ?status=shipped (etc.) for steps that need more input. */
  private preselectFromLink(): void {
    const wanted = this.route.snapshot.queryParamMap.get('status') as OrderStatus | null;
    const o = this.order();
    if (!wanted || !o?.allowed_transitions.includes(wanted)) return;
    this.choose(wanted);
    setTimeout(() => document.getElementById('update-status')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected async updateStatus(): Promise<void> {
    const o = this.order();
    const s = this.chosen();
    if (!o || !s) return;
    this.statusForm.markAllAsTouched();
    if (this.statusForm.invalid) return;
    const v = this.statusForm.getRawValue();
    if (s === 'cancelled' || s === 'refunded') {
      const paid = o.payment_status === 'paid';
      const ok = await this.confirm.ask({
        title: s === 'cancelled' ? `Cancel order ${o.number}?` : `Refund order ${o.number}?`,
        message:
          (paid
            ? `The payment of ${formatPaise(o.total_paise)} will be refunded to the customer's original payment method`
            : 'No payment was captured, so nothing will be refunded') +
          (o.wallet_redeemed_paise ? `, wallet points used (${formatPaise(o.wallet_redeemed_paise)}) are returned` : '') +
          (o.wallet_earned_paise ? `, and points earned on this order are reversed` : '') +
          (s === 'cancelled' ? '. Reserved stock is released.' : '.') +
          '\n\nThis cannot be undone.',
        confirmText: s === 'cancelled' ? 'Cancel order' : 'Refund order',
        cancelText: 'Keep order',
        danger: true,
      });
      if (!ok) return;
    }
    this.updating.set(true);
    this.statusError.set(null);
    try {
      const updated = await firstValueFrom(
        this.api.setOrderStatus(o.number, {
          status: s,
          note: nullIfBlank(v.note),
          courier: s === 'shipped' || v.courier ? nullIfBlank(v.courier) : null,
          tracking_number: nullIfBlank(v.tracking_number),
          tracking_url: nullIfBlank(v.tracking_url),
          notify_customer: v.notify_customer,
        }),
      );
      this.setOrder(updated);
      this.toast.success(`Order ${updated.number} is now ${humanize(updated.status).toLowerCase()}.`);
    } catch (err) {
      const e = toApiError(err);
      applyServerErrors(this.statusForm, e);
      this.statusError.set(e.message);
    } finally {
      this.updating.set(false);
    }
  }

  protected async saveNote(): Promise<void> {
    const o = this.order();
    if (!o || this.note.invalid) return;
    this.savingNote.set(true);
    try {
      const updated = await firstValueFrom(this.api.setOrderNote(o.number, nullIfBlank(this.note.value)));
      this.order.set(updated);
      this.note.reset(updated.admin_note ?? '');
      this.toast.success('Internal note saved.');
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.savingNote.set(false);
    }
  }
}
