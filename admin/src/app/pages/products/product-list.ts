import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { toApiError } from '../../core/errors';
import { Category, Page, Product, ProductStatusFilter } from '../../core/models';
import { ConfirmService, ToastService } from '../../core/ui.service';
import { MediaPipe, MoneyPipe } from '../../shared/pipes';
import { PageHeader, PagerComponent, StateComponent, StatusBadge } from '../../shared/ui';

@Component({
  selector: 'app-product-list',
  imports: [RouterLink, PageHeader, StateComponent, PagerComponent, StatusBadge, MoneyPipe, MediaPipe],
  templateUrl: './product-list.html',
})
export class ProductListPage {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly statuses: { value: ProductStatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'low_stock', label: 'Low stock' },
    { value: 'out_of_stock', label: 'Out of stock' },
  ];

  protected readonly q = signal('');
  protected readonly categoryId = signal<number | null>(null);
  protected readonly status = signal<ProductStatusFilter>('all');
  protected readonly page = signal(1);
  protected readonly pageSize = 25;

  protected readonly categories = signal<Category[]>([]);
  protected readonly result = signal<Page<Product> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly stockEdits = signal<Record<number, string>>({});
  protected readonly savingStock = signal<number | null>(null);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  constructor() {
    const qp = this.route.snapshot.queryParamMap;
    this.q.set(qp.get('q') ?? '');
    const cat = Number(qp.get('category'));
    this.categoryId.set(cat > 0 ? cat : null);
    const st = qp.get('status') as ProductStatusFilter | null;
    if (st && this.statuses.some((s) => s.value === st)) this.status.set(st);
    this.page.set(Math.max(1, Number(qp.get('page')) || 1));
    firstValueFrom(this.api.categories())
      .then((c) => this.categories.set(c))
      .catch(() => undefined);
    void this.load();
  }

  protected onSearch(value: string): void {
    this.q.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilters(), 300);
  }

  protected setCategory(v: string): void {
    this.categoryId.set(v ? Number(v) : null);
    this.applyFilters();
  }

  protected setStatus(s: ProductStatusFilter): void {
    this.status.set(s);
    this.applyFilters();
  }

  protected goTo(p: number): void {
    this.page.set(p);
    void this.load();
  }

  private applyFilters(): void {
    this.page.set(1);
    void this.load();
  }

  protected async load(): Promise<void> {
    const mine = ++this.seq;
    this.loading.set(true);
    this.error.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        q: this.q() || null,
        category: this.categoryId(),
        status: this.status() === 'all' ? null : this.status(),
        page: this.page() > 1 ? this.page() : null,
      },
    });
    try {
      const res = await firstValueFrom(
        this.api.products({
          q: this.q().trim() || null,
          category_id: this.categoryId(),
          status: this.status(),
          page: this.page(),
          page_size: this.pageSize,
        }),
      );
      if (mine !== this.seq) return;
      this.result.set(res);
      this.stockEdits.set({});
    } catch (err) {
      if (mine === this.seq) this.error.set(toApiError(err).message);
    } finally {
      if (mine === this.seq) this.loading.set(false);
    }
  }

  protected stockValue(p: Product): string {
    return this.stockEdits()[p.id] ?? String(p.stock);
  }

  protected editStock(p: Product, v: string): void {
    this.stockEdits.update((m) => ({ ...m, [p.id]: v }));
  }

  protected stockDirty(p: Product): boolean {
    const v = this.stockEdits()[p.id];
    return v !== undefined && v !== String(p.stock);
  }

  protected async saveStock(p: Product): Promise<void> {
    const raw = this.stockEdits()[p.id];
    if (raw === undefined) return;
    if (!/^\d+$/.test(raw) || Number(raw) > 1_000_000) {
      this.toast.error('Stock must be a whole number between 0 and 1,000,000.');
      return;
    }
    this.savingStock.set(p.id);
    try {
      const updated = await firstValueFrom(this.api.setStock(p.id, Number(raw)));
      this.replace(updated);
      this.stockEdits.update((m) => {
        const { [p.id]: _, ...rest } = m;
        return rest;
      });
      this.toast.success(`Stock for ${p.name} set to ${updated.stock}.`);
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.savingStock.set(null);
    }
  }

  protected async remove(p: Product): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete “${p.name}”?`,
      message:
        'This permanently removes the product and its images.\n\nIf the product appears in any order, it is archived (hidden from the store) instead, so order history stays intact.',
      confirmText: 'Delete product',
      danger: true,
    });
    if (!ok) return;
    try {
      await firstValueFrom(this.api.deleteProduct(p.id));
      // The API archives products that have orders; check which happened.
      let archived = false;
      try {
        const still = await firstValueFrom(this.api.product(p.id));
        archived = !!still;
      } catch {
        archived = false;
      }
      this.toast.success(
        archived ? `${p.name} has orders, so it was archived (set inactive) instead of deleted.` : `${p.name} deleted.`,
      );
      void this.load();
    } catch (err) {
      this.toast.error(toApiError(err).message);
    }
  }

  private replace(p: Product): void {
    this.result.update((r) => (r ? { ...r, items: r.items.map((x) => (x.id === p.id ? p : x)) } : r));
  }
}
