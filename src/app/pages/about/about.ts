import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { SeoService } from '../../core/seo/seo.service';

@Component({
  selector: 'app-about-page',
  template: `
    <main class="about-page">
      <p class="about-copy" data-aos="fade-up">
        SPUNI is a small Chennai atelier creating leather goods with a
        hands-on approach. From cutting and stitching to finishing, every piece
        is made by hand in our workshop with care for how it feels, works and lasts.
      </p>
    </main>
  `,
  styles: `
    .about-page { display: grid; min-height: 48svh; place-items: center; padding: clamp(72px, 12vw, 144px) var(--gutter); background: var(--brown); color: var(--cream); text-align: center; }
    .about-copy { max-width: 760px; margin: 0; color: rgba(238, 227, 210, .86); font-family: var(--font-display); font-size: clamp(1.25rem, 2.4vw, 1.8rem); line-height: 1.7; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPage {
  constructor() {
    inject(SeoService).set({
      title: 'Our Story',
      description: 'Meet SPUNI, the Chennai atelier behind our thoughtful materials and considered leather craftsmanship.',
      path: '/about',
    });
  }
}
