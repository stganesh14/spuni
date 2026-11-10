import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { toApiError } from '../../core/errors';
import { formatPaise, formatPaiseShort, humanize } from '../../core/format';
import { Dashboard, ORDER_STATUSES } from '../../core/models';
import { BarChart, BarDatum } from '../../shared/bar-chart';
import { DatePipe, MoneyPipe } from '../../shared/pipes';
import { PageHeader, StateComponent, StatusBadge } from '../../shared/ui';

interface Kpi {
  label: string;
  value: string;
  hint?: string;
  link?: string;
  query?: Record<string, string>;
  tone?: 'warn' | 'accent';
}

const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, PageHeader, StateComponent, StatusBadge, MoneyPipe, DatePipe, BarChart],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  private readonly api = inject(AdminApi);
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly money = formatPaiseShort;
  protected readonly count = (v: number) => String(Math.round(v));

  protected readonly kpis = computed<Kpi[]>(() => {
    const d = this.data();
    if (!d) return [];
    return [
      { label: 'Revenue today', value: formatPaise(d.revenue_today_paise), hint: `${d.orders_today} paid order(s)` },
      { label: 'Revenue · 30 days', value: formatPaise(d.revenue_30d_paise), hint: `${d.orders_30d} paid orders` },
      { label: 'Avg. order value', value: formatPaise(d.avg_order_value_paise), hint: 'Last 30 days' },
      {
        label: 'Pending fulfilment',
        value: String(d.pending_fulfilment),
        hint: 'Confirmed or processing',
        link: '/orders',
        query: { status: 'confirmed' },
        tone: d.pending_fulfilment ? 'accent' : undefined,
      },
      {
        label: 'Awaiting payment',
        value: String(d.awaiting_payment),
        link: '/orders',
        query: { status: 'pending_payment' },
      },
      { label: 'New customers', value: String(d.new_customers_30d), hint: 'Last 30 days', link: '/customers' },
      {
        label: 'Open customizations',
        value: String(d.open_customizations),
        hint: 'New or in review',
        link: '/customizations',
        tone: d.open_customizations ? 'accent' : undefined,
      },
      {
        label: 'Unread messages',
        value: String(d.unread_messages),
        link: '/messages',
        tone: d.unread_messages ? 'accent' : undefined,
      },
      { label: 'Launch subscribers', value: String(d.launch_subscribers), hint: 'Waiting to be notified', link: '/launches' },
      { label: 'Wallet liability', value: formatPaise(d.wallet_liability_paise), hint: 'Outstanding points balance' },
    ];
  });

  protected readonly revenueSeries = computed<BarDatum[]>(() =>
    (this.data()?.series ?? []).map((p) => ({
      label: dayFmt.format(new Date(p.date + 'T00:00:00')),
      value: p.revenue_paise,
      display: formatPaise(p.revenue_paise),
    })),
  );
  protected readonly orderSeries = computed<BarDatum[]>(() =>
    (this.data()?.series ?? []).map((p) => ({
      label: dayFmt.format(new Date(p.date + 'T00:00:00')),
      value: p.orders,
      display: `${p.orders} order${p.orders === 1 ? '' : 's'}`,
    })),
  );

  protected readonly breakdown = computed(() => {
    const b = this.data()?.status_breakdown ?? {};
    const total = Object.values(b).reduce((a, n) => a + n, 0);
    return ORDER_STATUSES.filter((s) => b[s])
      .map((s) => ({ status: s, label: humanize(s), count: b[s] ?? 0, pct: total ? ((b[s] ?? 0) / total) * 100 : 0 }))
      .sort((a, z) => z.count - a.count);
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await firstValueFrom(this.api.dashboard()));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }
}
