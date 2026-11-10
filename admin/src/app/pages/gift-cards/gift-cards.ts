import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { toApiError } from '../../core/errors';
import { GiftCard } from '../../core/models';
import { DatePipe, MoneyPipe } from '../../shared/pipes';
import { PageHeader, StateComponent, StatusBadge } from '../../shared/ui';

@Component({
  selector: 'app-gift-cards',
  imports: [RouterLink, PageHeader, StateComponent, StatusBadge, MoneyPipe, DatePipe],
  template: `
    <app-page-header title="Gift cards" eyebrow="Sales" subtitle="Digital gift cards bought in the store. Codes are never shown in full." />

    <div class="toolbar">
      <div class="tabs" role="group" aria-label="Status filter">
        @for (s of statuses; track s.value) {
          <button type="button" [attr.aria-pressed]="status() === s.value" (click)="setStatus(s.value)">{{ s.label }}</button>
        }
      </div>
      @if (items()?.length) {
        <span class="muted small">{{ items()!.length }} card(s) · {{ total() | money }}</span>
      }
    </div>

    <section class="card card-flush">
      <app-state
        [loading]="loading() && !items()"
        [error]="error()"
        [empty]="!!items() && items()!.length === 0"
        emptyTitle="No gift cards"
        (retry)="load()"
      />
      @if (items(); as list) {
        @if (list.length && !error()) {
          <div class="table-wrap" [style.opacity]="loading() ? 0.6 : 1">
            <table class="table responsive">
              <thead>
                <tr>
                  <th scope="col">Card</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col" class="num">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Expires</th>
                </tr>
              </thead>
              <tbody>
                @for (g of list; track g.id) {
                  <tr>
                    <td class="primary-cell" data-label="">
                      <span class="mono">{{ g.code_last4 ? '•••• ' + g.code_last4 : 'Not issued' }}</span>
                      <div class="small"><a class="mono" [routerLink]="['/orders', g.order_number]">{{ g.order_number }}</a></div>
                    </td>
                    <td data-label="From">
                      {{ g.sender_name }}
                      <div class="muted small">{{ g.purchaser_email }}</div>
                    </td>
                    <td data-label="To">
                      {{ g.recipient_name }}
                      <div class="muted small">{{ g.recipient_email }}</div>
                    </td>
                    <td class="num" data-label="Amount">{{ g.amount_paise | money }}</td>
                    <td data-label="Status">
                      <app-status [value]="g.status" />
                      @if (g.redeemed_at) {
                        <div class="muted small">{{ g.redeemed_at | dt }}</div>
                      }
                    </td>
                    <td data-label="Expires" class="nowrap">{{ g.expires_at | dt }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </section>
  `,
})
export class GiftCardsPage {
  private readonly api = inject(AdminApi);
  protected readonly statuses = [
    { value: '', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'redeemed', label: 'Redeemed' },
    { value: 'pending_payment', label: 'Pending payment' },
    { value: 'cancelled', label: 'Cancelled' },
  ];
  protected readonly status = signal('');
  protected readonly items = signal<GiftCard[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly total = computed(() => (this.items() ?? []).reduce((a, g) => a + g.amount_paise, 0));

  constructor() {
    void this.load();
  }

  protected setStatus(s: string): void {
    this.status.set(s);
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await firstValueFrom(this.api.giftCards(this.status() || undefined)));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }
}
