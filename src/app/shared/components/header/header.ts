import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NavigationStart, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, filter, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { gsap } from 'gsap';

import { Api } from '../../../core/api/api.service';
import { ProductCard } from '../../../core/api/models';
import { AuthService } from '../../../core/auth/auth.service';
import { CartService } from '../../../core/cart/cart.service';
import { StoreService } from '../../../core/cart/store.service';
import { WishlistService } from '../../../core/cart/wishlist.service';
import { MotionService } from '../../../core/motion/motion.service';
import { InrPipe } from '../../pipes/inr.pipe';
import { SpuniCashPipe } from '../../pipes/spuni-cash.pipe';
import { MagneticDirective } from '../../directives/magnetic.directive';

type Panel = 'shop' | 'men' | 'women' | null;

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, InrPipe, SpuniCashPipe, MagneticDirective],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly motion = inject(MotionService);
  protected readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);
  protected readonly wishlist = inject(WishlistService);
  protected readonly store = inject(StoreService);

  private readonly bagIcon = viewChild<ElementRef<HTMLElement>>('bagIcon');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly panel = signal<Panel>(null);
  protected readonly mobileOpen = signal(false);
  protected readonly mobileCategory = signal<string | null>(null);
  protected readonly searchOpen = signal(false);
  protected readonly query = signal('');
  protected readonly results = signal<ProductCard[]>([]);
  protected readonly searching = signal(false);

  protected readonly categories = computed(() => this.store.menu()?.categories ?? []);
  protected readonly featured = computed(() => (this.store.menu()?.featured ?? []).slice(0, 2));
  protected readonly scrolled = computed(() => this.motion.scrollY() > 24);
  protected readonly freeShipping = computed(() => this.store.info()?.free_shipping_threshold_paise ?? 0);
  protected readonly earnPercent = computed(() => Math.max(
    this.store.info()?.wallet_tier_1_percent ?? 2,
    this.store.info()?.wallet_tier_2_percent ?? 3,
    this.store.info()?.wallet_tier_3_percent ?? 4,
    this.store.info()?.wallet_tier_4_percent ?? 5,
  ));

  /** Product lists for the Men / Women panels, grouped by category. */
  protected readonly genderMenu = computed(() => {
    const panel = this.panel();
    if (panel !== 'men' && panel !== 'women') return [];
    return this.categories()
      .map((c) => ({ ...c, products: c.products.filter((p) => p.gender === panel || p.gender === 'unisex') }))
      .filter((c) => c.products.length > 0);
  });

  private readonly search$ = new Subject<string>();
  private closeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.store.loadMenu().subscribe();
    this.store.loadInfo().subscribe();

    this.router.events.pipe(filter((e) => e instanceof NavigationStart)).subscribe(() => this.closeAll());

    this.search$
      .pipe(
        debounceTime(220),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.length < 2) return of(null);
          this.searching.set(true);
          return this.api.searchSuggest(q).pipe(catchError(() => of(null)));
        }),
      )
      .subscribe((page) => {
        this.searching.set(false);
        this.results.set(page?.items ?? []);
      });

    // Bag icon bounce whenever something is added.
    effect(() => {
      const pulse = this.cart.pulse();
      if (!pulse || !this.isBrowser) return;
      const icon = untracked(() => this.bagIcon()?.nativeElement);
      if (icon && !this.motion.reduced()) {
        gsap.fromTo(icon, { scale: 1 }, { scale: 1.35, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' });
      }
    });
  }

  // ------------------------------------------------------------- mega menu
  openPanel(panel: Panel): void {
    clearTimeout(this.closeTimer);
    this.panel.set(panel);
  }

  scheduleClose(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.panel.set(null), 160);
  }

  togglePanel(panel: Panel, event: Event): void {
    event.preventDefault();
    this.panel.set(this.panel() === panel ? null : panel);
  }

  // ------------------------------------------------------------ mobile menu
  toggleMobile(): void {
    const next = !this.mobileOpen();
    this.mobileOpen.set(next);
    this.searchOpen.set(false);
    if (next) {
      this.motion.lockScroll();
      requestAnimationFrame(() => {
        if (this.motion.reduced()) return;
        gsap.fromTo('.m-item', { y: 28, autoAlpha: 0 }, {
          y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.045, ease: 'power3.out',
        });
      });
    } else this.motion.unlockScroll();
  }

  toggleMobileCategory(slug: string): void {
    this.mobileCategory.set(this.mobileCategory() === slug ? null : slug);
  }

  // ----------------------------------------------------------------- search
  openSearch(): void {
    this.panel.set(null);
    if (this.mobileOpen()) this.toggleMobile();
    this.searchOpen.set(true);
    setTimeout(() => this.searchInput()?.nativeElement.focus(), 60);
  }

  closeSearch(): void {
    this.searchOpen.set(false);
    this.query.set('');
    this.results.set([]);
  }

  onQuery(value: string): void {
    this.query.set(value);
    this.search$.next(value.trim());
  }

  submitSearch(event: Event): void {
    event.preventDefault();
    const q = this.query().trim();
    if (!q) return;
    this.router.navigate(['/shop'], { queryParams: { q } });
    this.closeSearch();
  }

  onEscape(): void {
    if (this.searchOpen()) this.closeSearch();
    else if (this.mobileOpen()) this.toggleMobile();
    else this.panel.set(null);
  }

  // ---------------------------------------------------------------- helpers
  openBag(): void {
    this.closeAll();
    this.cart.drawerOpen.set(true);
  }

  private closeAll(): void {
    this.panel.set(null);
    if (this.mobileOpen()) {
      this.mobileOpen.set(false);
      this.motion.unlockScroll();
    }
    if (this.searchOpen()) this.closeSearch();
  }
}
