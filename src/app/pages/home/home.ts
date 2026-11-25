import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { Api } from '../../core/api/api.service';
import { HomeData } from '../../core/api/models';
import { MotionService } from '../../core/motion/motion.service';
import { SeoService } from '../../core/seo/seo.service';
import { Bestsellers } from '../../features/components/bestsellers/bestsellers';
import { CategoryListing } from '../../features/components/category-listing/category-listing';
import { Customization } from '../../features/components/customization/customization';
import { EthicalLeather } from '../../features/components/ethical-leather/ethical-leather';
import { GiftTeaser } from '../../features/components/gift-teaser/gift-teaser';
import { Hero } from '../../features/components/hero/hero';
import { VintageFilm } from '../../features/components/vintage-film/vintage-film';
import { WhatsNew } from '../../features/components/whats-new/whats-new';
import { Marquee } from '../../shared/components/marquee/marquee';
import { StoreService } from '../../core/cart/store.service';

@Component({
  selector: 'app-home-page',
  imports: [Hero, Marquee, WhatsNew, Bestsellers, CategoryListing, VintageFilm, GiftTeaser, Customization, EthicalLeather],
  template: `
    <app-hero [banners]="data()?.banners ?? []" />
    <app-marquee [items]="ticker" tone="dark" />
    @if (failed()) {
      <div class="container offline">
        <p class="alert error" role="alert">We couldn't load the latest collection. Please refresh in a moment.</p>
      </div>
    }
    <app-whats-new [launches]="data()?.launches ?? []" />
    <app-bestsellers [products]="data()?.bestsellers ?? []" />
    <app-category-listing [categories]="data()?.categories ?? []" />
    <app-vintage-film />
    <app-gift-teaser />
    <app-customization />
    <app-marquee [items]="craft()" [reverse]="true" />
    <app-ethical-leather />
  `,
  styles: `
    :host { display: block; }
    .offline { padding-top: 24px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly api = inject(Api);
  private readonly motion = inject(MotionService);
  protected readonly store = inject(StoreService);

  protected readonly data = signal<HomeData | null>(null);
  protected readonly failed = signal(false);
  protected readonly ticker = [
    'Handcrafted in Chennai',
    'Slaughter-free leather that ages beautifully',
  ];
  protected readonly craft = computed(() => {
    const items = (this.store.info()?.customization_marquee_text ?? '')
      .split(/\r?\n/)
      .map((text) => text.trim())
      .filter((text) => text.length > 0);
    return items.length ? items : ['Cut', 'Stitched', 'Burnished', 'Carried', 'Loved', 'Passed on'];
  });

  constructor() {
    inject(SeoService).set({ path: '/' });
    this.store.loadInfo().subscribe();
    this.api.home().subscribe({
      next: (d) => {
        this.data.set(d);
        setTimeout(() => this.motion.refresh(), 300);
      },
      error: () => this.failed.set(true),
    });
  }
}
