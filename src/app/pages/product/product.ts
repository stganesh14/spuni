import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { Api } from '../../core/api/api.service';
import { ProductDetail } from '../../core/api/models';
import { CartService, MAX_QTY } from '../../core/cart/cart.service';
import { StoreService } from '../../core/cart/store.service';
import { WishlistService } from '../../core/cart/wishlist.service';
import { MotionService } from '../../core/motion/motion.service';
import { SeoService } from '../../core/seo/seo.service';
import { ZoomService } from '../../core/ui/zoom.service';
import { Bestsellers } from '../../features/components/bestsellers/bestsellers';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { MagneticDirective } from '../../shared/directives/magnetic.directive';
import { InrPipe } from '../../shared/pipes/inr.pipe';

interface State {
  loading: boolean;
  notFound: boolean;
  error: boolean;
  product: ProductDetail | null;
}

@Component({
  selector: 'app-product-page',
  imports: [RouterLink, InrPipe, EmptyState, Bestsellers, MagneticDirective],
  templateUrl: './product.html',
  styleUrl: './product.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly zoom = inject(ZoomService);
  private readonly document = inject(DOCUMENT);
  private readonly motion = inject(MotionService);
  protected readonly cart = inject(CartService);
  protected readonly wishlist = inject(WishlistService);
  protected readonly store = inject(StoreService);

  readonly slug = input.required<string>();

  protected readonly state = toSignal(
    toObservable(this.slug).pipe(
      switchMap((slug) =>
        this.api.product(slug).pipe(
          map((product): State => ({ loading: false, notFound: false, error: false, product })),
          catchError((err: unknown) =>
            of<State>({
              loading: false,
              notFound: err instanceof HttpErrorResponse && err.status === 404,
              error: !(err instanceof HttpErrorResponse && err.status === 404),
              product: null,
            }),
          ),
          startWith<State>({ loading: true, notFound: false, error: false, product: null }),
        ),
      ),
    ),
    { initialValue: { loading: true, notFound: false, error: false, product: null } as State },
  );

  protected readonly p = computed(() => this.state().product);
  protected readonly active = signal(0);
  protected readonly qty = signal(1);
  protected readonly open = signal<string | null>('details');
  protected readonly added = signal(false);

  protected readonly images = computed(() => {
    const p = this.p();
    if (!p) return [];
    return p.images.length ? p.images.map((i) => ({ url: i.url, alt: i.alt || p.name })) : p.image_url ? [{ url: p.image_url, alt: p.name }] : [];
  });
  protected readonly maxQty = computed(() => Math.min(MAX_QTY, this.p()?.available_quantity ?? 1));
  protected readonly discount = computed(() => {
    const p = this.p();
    return p?.compare_at_price_paise ? Math.round((1 - p.price_paise / p.compare_at_price_paise) * 100) : 0;
  });
  protected readonly earn = computed(() => {
    const p = this.p();
    const pct = this.store.info()?.wallet_earn_percent ?? 0;
    return p ? Math.floor((p.price_paise * this.qty() * pct) / 100 / 100) * 100 : 0;
  });
  protected readonly saved = computed(() => !!this.p() && this.wishlist.ids().includes(this.p()!.id));

  constructor() {
    const destroyRef = inject(DestroyRef);
    let ldScript: HTMLScriptElement | null = null;
    destroyRef.onDestroy(() => ldScript?.remove());

    effect(() => {
      const p = this.p();
      if (!p) return;
      untracked(() => {
        this.active.set(0);
        this.qty.set(1);
        this.seo.set({
          title: p.meta_title?.replace(/\s*\|\s*SPUNI.*$/i, '') || p.name,
          description: p.meta_description || p.short_description || p.description,
          image: p.image_url,
          path: `/product/${p.slug}`,
        });
        ldScript?.remove();
        ldScript = this.document.createElement('script');
        ldScript.type = 'application/ld+json';
        ldScript.text = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: p.name,
          sku: p.sku,
          image: p.images.map((i) => i.url),
          description: p.short_description || p.description,
          brand: { '@type': 'Brand', name: 'SPUNI' },
          offers: {
            '@type': 'Offer',
            priceCurrency: 'INR',
            price: (p.price_paise / 100).toFixed(2),
            availability: p.stock_status === 'out_of_stock' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          },
        }).replace(/</g, '\\u003c');
        this.document.head.appendChild(ldScript);
        setTimeout(() => this.motion.refresh(), 200);
      });
    });

    effect(() => {
      if (this.state().notFound) untracked(() => this.seo.set({ title: 'Product not found' }));
    });
  }

  select(i: number): void {
    this.active.set(i);
  }

  openZoom(event: Event, index: number): void {
    const target = event.currentTarget as HTMLElement | null;
    this.zoom.open({
      images: this.images(),
      index,
      title: this.p()?.name,
      origin: target?.getBoundingClientRect() ?? null,
    });
  }

  changeQty(delta: number): void {
    this.qty.set(Math.max(1, Math.min(this.maxQty(), this.qty() + delta)));
  }

  addToBag(): void {
    const p = this.p();
    if (!p || p.stock_status === 'out_of_stock') return;
    this.cart.add(p, this.qty());
    this.added.set(true);
    setTimeout(() => this.added.set(false), 1800);
  }

  buyNow(): void {
    const p = this.p();
    if (!p || p.stock_status === 'out_of_stock') return;
    if (!this.cart.has(p.id)) this.cart.add(p, this.qty(), false);
    this.router.navigateByUrl('/checkout');
  }

  toggle(section: string): void {
    this.open.set(this.open() === section ? null : section);
  }
}
