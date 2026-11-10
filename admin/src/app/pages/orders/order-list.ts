import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { toApiError } from '../../core/errors';
import { humanize, orderActionLabel } from '../../core/format';
import { ORDER_STATUSES, OrderRow, OrderStatus, Page } from '../../core/models';
import { ConfirmService, ToastService } from '../../core/ui.service';
import { DatePipe, MoneyPipe } from '../../shared/pipes';
import { PageHeader, PagerComponent, StateComponent, StatusBadge } from '../../shared/ui';

@Component({
  selector: 'app-order-list',
  imports: [RouterLink, PageHeader, StateComponent, PagerComponent, StatusBadge, MoneyPipe, DatePipe],
  templateUrl: './order-list.html',
})
export class OrderListPage {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly statuses = ORDER_STATUSES.map((s) => ({ value: s, label: humanize(s) }));
  protected readonly q = signal('');
  protected readonly status = signal<OrderStatus | ''>('');
  protected readonly type = signal<'' | 'product' | 'gift_card'>('');
  protected readonly page = signal(1);
  protected readonly result = signal<Page<OrderRow> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  /** Order number whose status is being changed from the list. */
  protected readonly busy = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  constructor() {
    const qp = this.route.snapshot.queryParamMap;
    this.q.set(qp.get('q') ?? '');
    const st = qp.get('status') as OrderStatus | null;
    if (st && ORDER_STATUSES.includes(st)) this.status.set(st);
    const t = qp.get('type');
    if (t === 'product' || t === 'gift_card') this.type.set(t);
    this.page.set(Math.max(1, Number(qp.get('page')) || 1));
    void this.load();
  }

  protected onSearch(v: string): void {
    this.q.set(v);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reset(), 300);
  }
  protected setStatus(v: string): void {
    this.status.set(v as OrderStatus | '');
    this.reset();
  }
  protected setType(v: string): void {
    this.type.set(v as '' | 'product' | 'gift_card');
    this.reset();
  }
  protected goTo(p: number): void {
    this.page.set(p);
    void this.load();
  }
  private reset(): void {
    this.page.set(1);
    void this.load();
  }

  protected actionLabel(s: string): string {
    return orderActionLabel(s);
  }

  /** Shipping needs tracking details, and cancel/refund move money: those open the order page. */
  protected needsDetails(s: OrderStatus): boolean {
    return s === 'shipped' || s === 'cancelled' || s === 'refunded';
  }

  protected async changeStatus(o: OrderRow, select: HTMLSelectElement): Promise<void> {
    const s = select.value as OrderStatus;
    select.value = '';
    if (!s) return;
    if (this.needsDetails(s)) {
      void this.router.navigate(['/orders', o.number], { queryParams: { status: s } });
      return;
    }
    const ok = await this.confirm.ask({
      title: `${orderActionLabel(s)}?`,
      message: `Order ${o.number} will move to "${humanize(s).toLowerCase()}" and ${o.email} will get an email about it.`,
      confirmText: orderActionLabel(s),
      cancelText: 'Not now',
    });
    if (!ok) return;
    this.busy.set(o.number);
    try {
      const updated = await firstValueFrom(
        this.api.setOrderStatus(o.number, {
          status: s, note: null, courier: null, tracking_number: null, tracking_url: null, notify_customer: true,
        }),
      );
      this.toast.success(`Order ${updated.number} is now ${humanize(updated.status).toLowerCase()}. Customer emailed.`);
      await this.load();
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.busy.set(null);
    }
  }

  protected async load(): Promise<void> {
    const mine = ++this.seq;
    this.loading.set(true);
    this.error.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: { q: this.q() || null, status: this.status() || null, type: this.type() || null, page: this.page() > 1 ? this.page() : null },
    });
    try {
      const res = await firstValueFrom(
        this.api.orders({
          q: this.q().trim() || null,
          status: this.status() || null,
          order_type: this.type() || null,
          page: this.page(),
          page_size: 25,
        }),
      );
      if (mine === this.seq) this.result.set(res);
    } catch (err) {
      if (mine === this.seq) this.error.set(toApiError(err).message);
    } finally {
      if (mine === this.seq) this.loading.set(false);
    }
  }
}
