import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { StoreService } from '../../../core/cart/store.service';
import { InrPipe } from '../../../shared/pipes/inr.pipe';
import { RevealTextDirective } from '../../../shared/directives/reveal-text.directive';

/** "Gift a loved one": send a SPUNI leather piece, gift-wrapped with a handwritten note, to their door. */
@Component({
  selector: 'app-gift-teaser',
  imports: [RouterLink, InrPipe, RevealTextDirective],
  template: `
    <section class="gift" aria-labelledby="gift-title">
      <div class="container grid">
        <div class="visual" aria-hidden="true">
          <div class="visual-meta">
            <span>01 / Curated for gifting</span>
            <span>SPUNI · Chennai</span>
          </div>
          <div class="parcel">
            <img [src]="giftImage()" alt="" loading="lazy" decoding="async" />
          </div>
          <div class="gift-note">
            <i class="bi bi-gift"></i>
            <span>Wrapped by hand<small>With your note, for someone you love</small></span>
          </div>
        </div>

        <div class="copy">
          <span class="eyebrow">Gift a loved one</span>
          <h2 id="gift-title" class="title" appRevealText="words">Give something they'll <em>carry for years.</em></h2>
          <p class="lead">Choose any SPUNI piece and we'll wrap it by hand, tuck in your note and deliver it to their door.</p>

          <ul class="ways">
            <li>
              <i class="bi bi-bag-heart"></i>
              <div><b>Pick a piece they'll love</b><span>Wallets, belts, totes and travel bags, handcrafted in Chennai.</span></div>
            </li>
            <li>
              <i class="bi bi-gift"></i>
              <div><b>Wrapped with your note</b>
                <span>Signature gift wrap{{ wrap() ? ' for ' : '' }}{{ wrap() ? (wrap() | inr) : '' }} and a handwritten card in your words.</span></div>
            </li>
            <li>
              <i class="bi bi-truck"></i>
              <div><b>Delivered to their door</b><span>Ship to their address. Prices stay off the packing slip.</span></div>
            </li>
          </ul>

          <div class="ctas">
            <a class="btn btn-primary" routerLink="/gift"><i class="bi bi-gift"></i> Send a gift</a>
            <a class="btn btn-ghost" routerLink="/shop" [queryParams]="{ sort: 'featured' }">Browse the collection</a>
          </div>
        </div>
      </div>
    </section>
  `,
  styleUrl: './gift-teaser.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GiftTeaser {
  private readonly store = inject(StoreService);
  protected readonly wrap = computed(() => this.store.info()?.gift_wrap_paise ?? 0);
  protected readonly giftImage = computed(() =>
    this.store.info()?.home_media?.['gift_teaser'] || '/assets/classic-handbag.jpeg'
  );
}
