import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { Api } from '../../core/api/api.service';
import { Launch, ProductCard } from '../../core/api/models';
import { SeoService } from '../../core/seo/seo.service';
import { Bestsellers } from '../../features/components/bestsellers/bestsellers';
import { WhatsNew } from '../../features/components/whats-new/whats-new';
import { Marquee } from '../../shared/components/marquee/marquee';

@Component({
  selector: 'app-whats-new-page',
  imports: [WhatsNew, Bestsellers, Marquee],
  template: `
    <div class="page-top"></div>
    @if (failed()) {
      <div class="container"><p class="alert error" role="alert">We couldn't load the upcoming drops. Please refresh in a moment.</p></div>
    }
    <app-whats-new [launches]="launches()" [full]="true" />
    <app-marquee [items]="ticker" tone="dark" />
    @if (latest().length) {
      <app-bestsellers [products]="latest()" eyebrow="Just landed" heading="New in the atelier" />
    }
  `,
  styles: `
    :host { display: block; }
    .page-top { height: calc(var(--header-h) + var(--announce-h)); background: var(--cream); }
    .alert { margin: 20px 0; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsNewPage {
  private readonly api = inject(Api);
  protected readonly launches = signal<Launch[]>([]);
  protected readonly latest = signal<ProductCard[]>([]);
  protected readonly failed = signal(false);
  protected readonly ticker = ['Drops every month', 'Notify me, never miss one', 'Limited first editions', 'Handcrafted in Chennai'];

  constructor() {
    inject(SeoService).set({
      title: "What's New",
      description: 'Upcoming SPUNI launches. Tap Notify me and we will email you the moment a drop goes live.',
      path: '/whats-new',
    });
    this.api.launches().subscribe({ next: (l) => this.launches.set(l), error: () => this.failed.set(true) });
    this.api.products({ sort: 'newest', page_size: 8 }).subscribe({ next: (p) => this.latest.set(p.items), error: () => undefined });
  }
}
