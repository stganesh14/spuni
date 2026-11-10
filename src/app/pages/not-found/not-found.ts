import { ChangeDetectionStrategy, Component, RESPONSE_INIT, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SeoService } from '../../core/seo/seo.service';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <div class="page nf">
      <div class="container">
        <p class="code" aria-hidden="true"><span>4</span><span class="o">0</span><span>4</span></p>
        <h1 class="title">This page wandered off.</h1>
        <p class="lead">Like a favourite wallet, it'll turn up. Meanwhile, here's where to look.</p>
        <div class="row">
          <a class="btn btn-primary" routerLink="/shop">Shop the collection</a>
          <a class="btn btn-ghost" routerLink="/">Back home</a>
        </div>
      </div>
    </div>
  `,
  styles: `
    .nf { text-align: center; }
    .code { display: flex; justify-content: center; gap: .1em; margin: 0; font-family: var(--font-display);
      font-size: clamp(6rem, 26vw, 16rem); line-height: 1; color: transparent; -webkit-text-stroke: 1.5px var(--brown); }
    .code span { display: inline-block; animation: bob 3s ease-in-out infinite alternate; }
    .code span:nth-child(2) { animation-delay: -1s; color: var(--burgundy); -webkit-text-stroke: 0; }
    .code span:nth-child(3) { animation-delay: -2s; }
    @keyframes bob { from { transform: translateY(-10px) rotate(-4deg); } to { transform: translateY(10px) rotate(4deg); } }
    .row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 18px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {
  constructor() {
    inject(SeoService).set({ title: 'Page not found' });
    const response = inject(RESPONSE_INIT, { optional: true });
    if (response) response.status = 404;
  }
}
