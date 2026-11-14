import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { toApiError } from '../../core/errors';
import { CustomerRow, Page } from '../../core/models';
import { DatePipe, MoneyPipe, SpuniCashPipe } from '../../shared/pipes';
import { PageHeader, PagerComponent, StateComponent, StatusBadge } from '../../shared/ui';

@Component({
  selector: 'app-customer-list',
  imports: [RouterLink, PageHeader, StateComponent, PagerComponent, StatusBadge, MoneyPipe, SpuniCashPipe, DatePipe],
  template: `
    <app-page-header title="Customers" eyebrow="Sales" [subtitle]="result() ? result()!.total + ' account(s)' : ''" />

    <div class="toolbar" role="search">
      <label class="visually-hidden" for="cust-search">Search customers</label>
      <input
        id="cust-search"
        class="input search"
        type="search"
        maxlength="80"
        placeholder="Email, name or phone…"
        [value]="q()"
        (input)="onSearch($any($event.target).value)"
      />
      <div class="tabs" role="group" aria-label="Role filter">
        <button type="button" [attr.aria-pressed]="role() === ''" (click)="setRole('')">All</button>
        <button type="button" [attr.aria-pressed]="role() === 'customer'" (click)="setRole('customer')">Customers</button>
        <button type="button" [attr.aria-pressed]="role() === 'admin'" (click)="setRole('admin')">Admins</button>
      </div>
    </div>

    <section class="card card-flush">
      <app-state
        [loading]="loading() && !result()"
        [error]="error()"
        [empty]="!!result() && result()!.items.length === 0"
        emptyTitle="No customers found"
        (retry)="load()"
      />
      @if (result(); as r) {
        @if (r.items.length && !error()) {
          <div class="table-wrap" [style.opacity]="loading() ? 0.6 : 1">
            <table class="table responsive">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Phone</th>
                  <th scope="col" class="num">Orders</th>
                  <th scope="col" class="num">Spent</th>
                  <th scope="col" class="num">Wallet</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (c of r.items; track c.id) {
                  <tr>
                    <td class="primary-cell" data-label="">
                      <a class="row-link" [routerLink]="['/customers', c.id]">{{ c.full_name || c.email }}</a>
                      @if (c.full_name) {
                        <div class="muted small">{{ c.email }}</div>
                      }
                    </td>
                    <td data-label="Phone">{{ c.phone || '—' }}</td>
                    <td class="num" data-label="Orders">{{ c.order_count }}</td>
                    <td class="num" data-label="Spent">{{ c.total_spent_paise | money }}</td>
                    <td class="num" data-label="Wallet">{{ c.wallet_balance_paise | spuniCash:c.wallet_cash_value_paise }}</td>
                    <td data-label="Last sign-in" class="nowrap">{{ c.last_login_at | dt }}</td>
                    <td data-label="Status">
                      @if (c.role === 'admin') {
                        <span class="badge" data-tone="gold">Admin</span>
                      }
                      <app-status [value]="c.is_active ? 'active' : 'inactive'" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-pager [page]="r.page" [pages]="r.pages" [total]="r.total" [pageSize]="r.page_size" (go)="goTo($event)" />
        }
      }
    </section>
  `,
})
export class CustomerListPage {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly q = signal('');
  protected readonly role = signal<'' | 'customer' | 'admin'>('');
  protected readonly page = signal(1);
  protected readonly result = signal<Page<CustomerRow> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  constructor() {
    const qp = this.route.snapshot.queryParamMap;
    this.q.set(qp.get('q') ?? '');
    const r = qp.get('role');
    if (r === 'customer' || r === 'admin') this.role.set(r);
    this.page.set(Math.max(1, Number(qp.get('page')) || 1));
    void this.load();
  }

  protected onSearch(v: string): void {
    this.q.set(v);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page.set(1);
      void this.load();
    }, 300);
  }
  protected setRole(r: '' | 'customer' | 'admin'): void {
    this.role.set(r);
    this.page.set(1);
    void this.load();
  }
  protected goTo(p: number): void {
    this.page.set(p);
    void this.load();
  }

  protected async load(): Promise<void> {
    const mine = ++this.seq;
    this.loading.set(true);
    this.error.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: { q: this.q() || null, role: this.role() || null, page: this.page() > 1 ? this.page() : null },
    });
    try {
      const res = await firstValueFrom(
        this.api.customers({ q: this.q().trim() || null, role: this.role() || null, page: this.page(), page_size: 25 }),
      );
      if (mine === this.seq) this.result.set(res);
    } catch (err) {
      if (mine === this.seq) this.error.set(toApiError(err).message);
    } finally {
      if (mine === this.seq) this.loading.set(false);
    }
  }
}
