import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { Api } from '../../core/api/api.service';
import { ProductCard, ProductQuery } from '../../core/api/models';
import { StoreService } from '../../core/cart/store.service';
import { SeoService } from '../../core/seo/seo.service';
import { GIFT_INTENT_KEY, safeStorage } from '../../core/utils/storage';
import { ProductCardComponent } from '../../shared/components/product-card/product-card';
import { RevealTextDirective } from '../../shared/directives/reveal-text.directive';
import { InrPipe } from '../../shared/pipes/inr.pipe';

interface Occasion {
  key: string;
  label: string;
  query: Partial<ProductQuery>;
}

const OCCASIONS: Occasion[] = [
  { key: 'all', label: 'All gifts', query: {} },
  { key: 'her', label: 'For her', query: { gender: 'women' } },
  { key: 'him', label: 'For him', query: { gender: 'men' } },
  { key: 'personal', label: 'Personalised', query: { customizable: true } },
  { key: 'u5', label: 'Under ₹5,000', query: { max_price: 500000 } },
];

type Picks = { items: ProductCard[]; loading: boolean; failed: boolean };

@Component({
  selector: 'app-gift-page',
  imports: [RouterLink, InrPipe, ProductCardComponent, RevealTextDirective],
  templateUrl: './gift.html',
  styleUrl: './gift.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GiftPage {
  private readonly api = inject(Api);
  private readonly store = inject(StoreService);

  protected readonly occasions = OCCASIONS;
  protected readonly occasion = signal(OCCASIONS[0]);
  protected readonly wrap = computed(() => this.store.info()?.gift_wrap_paise ?? 0);

  protected readonly picks = toSignal(
    toObservable(this.occasion).pipe(
      switchMap((o) =>
        this.api.products({ sort: 'featured', page_size: 8, in_stock: true, ...o.query }).pipe(
          map((page): Picks => ({ items: page.items, loading: false, failed: false })),
          catchError(() => of<Picks>({ items: [], loading: false, failed: true })),
          startWith<Picks>({ items: [], loading: true, failed: false }),
        ),
      ),
    ),
    { initialValue: { items: [], loading: true, failed: false } as Picks },
  );

  constructor() {
    inject(SeoService).set({
      title: 'Gift a loved one',
      description: 'Send a handcrafted SPUNI leather piece as a gift: wrapped by hand, with your note, delivered to their door.',
      path: '/gift',
    });
    this.store.loadInfo().subscribe();
    safeStorage.setSession(GIFT_INTENT_KEY, '1');
  }
}
