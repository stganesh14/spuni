import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { Api } from '../api/api.service';
import { ProductCard } from '../api/models';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../ui/toast.service';
import { safeStorage } from '../utils/storage';

const KEY = 'spuni.wishlist.v1';

/** Guests keep their wishlist locally; it merges into the account on sign-in. */
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly ids = signal<number[]>(this.isBrowser ? safeStorage.get<number[]>(KEY, []).filter(Number.isInteger) : []);
  readonly count = computed(() => this.ids().length);

  constructor() {
    this.auth.onLogin(() => this.mergeOnLogin());
  }

  isSaved(id: number): boolean {
    return this.ids().includes(id);
  }

  toggle(product: ProductCard): void {
    const saved = this.isSaved(product.id);
    this.ids.update((ids) => (saved ? ids.filter((i) => i !== product.id) : [product.id, ...ids].slice(0, 200)));
    this.persistLocal();
    if (this.auth.isLoggedIn()) {
      const call = saved ? this.api.removeWishlist(product.id) : this.api.addWishlist(product.id);
      call.subscribe({ error: () => this.toast.error('Could not update your wishlist. Please try again.') });
    }
    this.toast.show(saved ? `Removed ${product.name} from your wishlist` : `Saved ${product.name} to your wishlist`,
      saved ? 'info' : 'success', saved ? undefined : { label: 'View', link: '/wishlist' });
  }

  /** Server list for signed-in customers, local ids resolved by the page for guests. */
  loadServer() {
    return this.api.wishlist();
  }

  replace(products: ProductCard[]): void {
    this.ids.set(products.map((p) => p.id));
    this.persistLocal();
  }

  private mergeOnLogin(): void {
    const local = this.ids();
    const adds = local.map((id) => this.api.addWishlist(id).pipe(catchError(() => of(null))));
    (adds.length ? forkJoin(adds) : of([])).subscribe(() => {
      this.api.wishlist().subscribe({ next: (items) => this.replace(items), error: () => undefined });
    });
  }

  private persistLocal(): void {
    if (this.isBrowser) safeStorage.set(KEY, this.ids());
  }
}
