import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { toApiError } from '../../core/errors';
import { humanize } from '../../core/format';
import { CUSTOMIZATION_STATUSES, Customization, CustomizationStatus } from '../../core/models';
import { DatePipe, HumanizePipe, MoneyPipe } from '../../shared/pipes';
import { PageHeader, StateComponent, StatusBadge } from '../../shared/ui';

@Component({
  selector: 'app-customization-list',
  imports: [RouterLink, PageHeader, StateComponent, StatusBadge, DatePipe, MoneyPipe, HumanizePipe],
  template: `
    <app-page-header title="Customization requests" eyebrow="Sales" subtitle="Personalisation, custom designs and expert consultations." />

    <div class="toolbar">
      <label class="visually-hidden" for="cz-status">Status</label>
      <select id="cz-status" class="select" (change)="setStatus($any($event.target).value)">
        <option value="" [selected]="!status()">All statuses</option>
        @for (s of statuses; track s.value) {
          <option [value]="s.value" [selected]="status() === s.value">{{ s.label }}</option>
        }
      </select>
      @if (items()) {
        <span class="muted small">{{ items()!.length }} request(s)</span>
      }
    </div>

    <section class="card card-flush">
      <app-state
        [loading]="loading() && !items()"
        [error]="error()"
        [empty]="!!items() && items()!.length === 0"
        emptyTitle="No requests"
        emptyText="Customization requests from the store will appear here."
        (retry)="load()"
      />
      @if (items(); as list) {
        @if (list.length && !error()) {
          <div class="table-wrap" [style.opacity]="loading() ? 0.6 : 1">
            <table class="table responsive">
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Type</th>
                  <th scope="col">Product</th>
                  <th scope="col" class="num">Budget / quote</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (c of list; track c.reference) {
                  <tr>
                    <td class="primary-cell" data-label="">
                      <a class="row-link mono" [routerLink]="['/customizations', c.reference]">{{ c.reference }}</a>
                      <div class="muted small">{{ c.created_at | dt: true }}</div>
                    </td>
                    <td data-label="Customer">
                      <div>{{ c.customer_name || '—' }}</div>
                      <div class="muted small">{{ c.customer_email }}</div>
                    </td>
                    <td data-label="Type">{{ c.kind | humanize }}</td>
                    <td data-label="Product">{{ c.product_name || '—' }}</td>
                    <td class="num" data-label="Budget / quote">
                      {{ c.quoted_price_paise ? (c.quoted_price_paise | money) : c.budget_paise ? (c.budget_paise | money) : '—' }}
                      @if (c.quoted_price_paise) {
                        <div class="muted small">quoted</div>
                      } @else if (c.budget_paise) {
                        <div class="muted small">budget</div>
                      }
                    </td>
                    <td data-label="Status"><app-status [value]="c.status" /></td>
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
export class CustomizationListPage {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly statuses = CUSTOMIZATION_STATUSES.map((s) => ({ value: s, label: humanize(s) }));
  protected readonly status = signal<CustomizationStatus | ''>('');
  protected readonly items = signal<Customization[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const st = this.route.snapshot.queryParamMap.get('status') as CustomizationStatus | null;
    if (st && CUSTOMIZATION_STATUSES.includes(st)) this.status.set(st);
    void this.load();
  }

  protected setStatus(v: string): void {
    this.status.set(v as CustomizationStatus | '');
    void this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: { status: v || null } });
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await firstValueFrom(this.api.customizations(this.status() || undefined)));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }
}
