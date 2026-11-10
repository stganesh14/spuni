import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { Api } from '../../core/api/api.service';
import { Category, Gender, Page, ProductCard, ProductQuery } from '../../core/api/models';
import { MotionService } from '../../core/motion/motion.service';
import { SeoService } from '../../core/seo/seo.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ProductCardComponent } from '../../shared/components/product-card/product-card';
import { RevealTextDirective } from '../../shared/directives/reveal-text.directive';
import { ZoomableDirective } from '../../shared/directives/zoomable.directive';

type Sort = NonNullable<ProductQuery['sort']>;
const SORTS: { value: Sort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name A to Z' },
];
const PRICES = [
  { key: 'u5', label: 'Under ₹5,000', min: null, max: 500000 },
  { key: '5-10', label: '₹5,000 to ₹10,000', min: 500000, max: 1000000 },
  { key: '10-15', label: '₹10,000 to ₹15,000', min: 1000000, max: 1500000 },
  { key: 'o15', label: 'Over ₹15,000', min: 1500000, max: null },
];
const PAGE_SIZE = 12;

interface State {
  loading: boolean;
  error: boolean;
  page: Page<ProductCard> | null;
}

/** /shop and /category/:slug: filterable, URL-driven product listing with floating cards. */
@Component({
  selector: 'app-shop-page',
  imports: [RouterLink, ProductCardComponent, EmptyState, RevealTextDirective, ZoomableDirective],
  templateUrl: './shop.html',
  styleUrl: './shop.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly motion = inject(MotionService);

  // Route params and query params (bound by the router).
  readonly slug = input<string | undefined>();
  readonly q = input<string | undefined>();
  readonly gender = input<string | undefined>();
  readonly sort = input<string | undefined>();
  readonly price = input<string | undefined>();
  readonly stock = input<string | undefined>();
  readonly page = input(1, { transform: (v: unknown) => Math.max(1, Math.min(1000, numberAttribute(v, 1) || 1)) });

  protected readonly sorts = SORTS;
  protected readonly prices = PRICES;
  protected readonly filtersOpen = signal(false);

  protected readonly categories = signal<Category[]>([]);
  protected readonly category = computed(() => this.categories().find((c) => c.slug === this.slug()) ?? null);
  protected readonly categoryMissing = computed(() => !!this.slug() && this.categoriesLoaded() && !this.category());
  private readonly categoriesLoaded = signal(false);

  protected readonly genderValue = computed<Gender | null>(() => {
    const g = this.gender();
    return g === 'men' || g === 'women' ? g : null;
  });
  protected readonly sortValue = computed<Sort>(() => (SORTS.find((s) => s.value === this.sort())?.value ?? 'featured'));
  protected readonly priceValue = computed(() => PRICES.find((p) => p.key === this.price()) ?? null);
  protected readonly inStockOnly = computed(() => this.stock() === '1');
  protected readonly search = computed(() => (this.q() ?? '').trim().slice(0, 80));

  private readonly query = computed<ProductQuery>(() => ({
    category: this.slug() ?? null,
    gender: this.genderValue(),
    q: this.search() || null,
    sort: this.sortValue(),
    min_price: this.priceValue()?.min ?? null,
    max_price: this.priceValue()?.max ?? null,
    in_stock: this.inStockOnly() || null,
    page: this.page(),
    page_size: PAGE_SIZE,
  }));

  protected readonly state = toSignal(
    toObservable(this.query).pipe(
      switchMap((query) =>
        this.api.products(query).pipe(
          map((page): State => ({ loading: false, error: false, page })),
          catchError(() => of<State>({ loading: false, error: true, page: null })),
          startWith<State>({ loading: true, error: false, page: null }),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, page: null } as State },
  );

  protected readonly products = computed(() => this.state().page?.items ?? []);
  protected readonly total = computed(() => this.state().page?.total ?? 0);
  protected readonly pages = computed(() => this.state().page?.pages ?? 1);
  protected readonly pageList = computed(() => Array.from({ length: this.pages() }, (_, i) => i + 1));
  protected readonly activeFilters = computed(
    () => [this.genderValue(), this.priceValue(), this.inStockOnly() || null, this.search() || null].filter(Boolean).length,
  );

  protected readonly heading = computed(() => {
    if (this.category()) return this.category()!.name;
    if (this.search()) return `Results for “${this.search()}”`;
    if (this.genderValue() === 'men') return 'For him';
    if (this.genderValue() === 'women') return 'For her';
    return 'The full collection';
  });

  constructor() {
    this.api.categories().subscribe({
      next: (c) => {
        this.categories.set(c);
        this.categoriesLoaded.set(true);
      },
      error: () => this.categoriesLoaded.set(true),
    });

    effect(() => {
      const cat = this.category();
      const heading = this.heading();
      untracked(() =>
        this.seo.set({
          title: heading,
          description: cat?.description ?? 'Shop handcrafted vegan leather bags, wallets, belts and travel goods.',
          image: cat?.image_url,
          path: this.slug() ? `/category/${this.slug()}` : '/shop',
        }),
      );
    });

    effect(() => {
      if (!this.state().loading) untracked(() => setTimeout(() => this.motion.refresh(), 100));
    });
  }

  setParam(key: string, value: string | null): void {
    this.router.navigate([], {
      queryParams: { [key]: value || null, page: null },
      queryParamsHandling: 'merge',
      preserveFragment: false,
    });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.pages()) return;
    this.router.navigate([], { queryParams: { page: page === 1 ? null : page }, queryParamsHandling: 'merge' });
    this.motion.scrollTo(0);
  }

  clearFilters(): void {
    this.router.navigate([], { queryParams: { gender: null, price: null, stock: null, q: null, page: null }, queryParamsHandling: 'merge' });
  }
}
