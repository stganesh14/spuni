import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SeoService } from '../../core/seo/seo.service';
import { RevealTextDirective } from '../../shared/directives/reveal-text.directive';
import { ZoomableDirective } from '../../shared/directives/zoomable.directive';
import { INFO_PAGES } from './content';

@Component({
  selector: 'app-info-page',
  imports: [RouterLink, RevealTextDirective, ZoomableDirective],
  template: `
    @if (content(); as c) {
      <div class="page info">
        <div class="container">
          <header class="head" [class.with-image]="c.image">
            <div>
              <span class="eyebrow">{{ c.eyebrow }}</span>
              @for (t of [c.title]; track t) { <h1 class="display" appRevealText="words">{{ t }}</h1> }
              <p class="lead">{{ c.lead }}</p>
            </div>
            @if (c.image) {
              <div class="media"><img [src]="c.image" [alt]="c.title" [appZoomable]="c.image" [zoomTitle]="c.title" /></div>
            }
          </header>

          <div class="body">
            <nav class="toc" aria-label="On this page">
              @for (link of links; track link.path) {
                <a [routerLink]="link.path" [class.on]="link.path === '/' + page()">{{ link.label }}</a>
              }
            </nav>
            <article>
              @for (s of c.sections; track s.heading; let i = $index) {
                <section [style.--i]="i">
                  <h2><span>{{ (i + 1).toString().padStart(2, '0') }}</span>{{ s.heading }}</h2>
                  @for (p of s.body; track $index) { <p>{{ p }}</p> }
                </section>
              }
              @if (c.faq) {
                <div class="faq">
                  @for (f of c.faq; track f.q; let i = $index) {
                    <div class="qa" [class.open]="open() === i">
                      <button type="button" (click)="open.set(open() === i ? -1 : i)" [attr.aria-expanded]="open() === i">
                        {{ f.q }} <i class="bi bi-plus-lg"></i></button>
                      <div class="a"><div><p>{{ f.a }}</p></div></div>
                    </div>
                  }
                </div>
              }
              <p class="help">Still need help? <a routerLink="/contact">Contact the atelier</a>.</p>
            </article>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .head { display: grid; gap: 28px; align-items: end; margin-bottom: clamp(30px, 5vw, 60px); }
    @media (min-width: 900px) { .head.with-image { grid-template-columns: 1.2fr 1fr; } }
    .head .display { margin: 12px 0; } .head .lead { margin: 0; max-width: 60ch; }
    .media { aspect-ratio: 4 / 3; border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-soft);
      animation: bob 7s ease-in-out infinite alternate; }
    .media img { width: 100%; height: 100%; object-fit: cover; }
    @keyframes bob { from { transform: translateY(-8px) rotate(-1deg); } to { transform: translateY(8px) rotate(1deg); } }
    .body { display: grid; gap: 28px; }
    @media (min-width: 900px) { .body { grid-template-columns: 200px 1fr; } .toc { position: sticky; top: calc(var(--header-h) + 20px); align-self: start; } }
    .toc { display: flex; flex-wrap: wrap; gap: 6px; }
    @media (min-width: 900px) { .toc { flex-direction: column; } }
    .toc a { padding: 8px 12px; border-radius: 10px; color: var(--brown-soft); text-decoration: none; font-size: .88rem; }
    .toc a.on { background: var(--brown); color: var(--cream); }
    article { max-width: 760px; }
    section { padding: 0 0 26px; animation: rise .6s var(--ease-out) both calc(var(--i) * 60ms); }
    @keyframes rise { from { opacity: 0; transform: translateY(16px); } }
    h2 { display: flex; gap: 12px; align-items: baseline; margin: 0 0 10px; font-family: var(--font-display); font-weight: 400; font-size: 1.6rem; }
    h2 span { font-family: var(--font-mono); font-size: .7rem; color: var(--gold); }
    p { color: var(--brown-soft); line-height: 1.75; }
    .qa { border-bottom: 1px solid var(--line); }
    .qa button { width: 100%; display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 18px 0;
      background: none; border: 0; text-align: left; font-family: var(--font-display); font-size: 1.2rem; color: var(--ink); cursor: pointer; }
    .qa i { transition: transform .4s var(--ease-out); }
    .qa .a { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .45s var(--ease-out); }
    .qa .a > div { overflow: hidden; } .qa .a p { margin: 0 0 18px; }
    .qa.open .a { grid-template-rows: 1fr; } .qa.open i { transform: rotate(135deg); }
    .help { margin-top: 30px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoPage {
  private readonly seo = inject(SeoService);
  readonly page = input.required<string>();
  protected readonly content = computed(() => INFO_PAGES[this.page()] ?? null);
  protected readonly open = signal(0);
  protected readonly links = [
    { path: '/about', label: 'Our story' },
    { path: '/shipping', label: 'Shipping' },
    { path: '/returns', label: 'Returns & refunds' },
    { path: '/faq', label: 'FAQs' },
    { path: '/privacy', label: 'Privacy' },
    { path: '/terms', label: 'Terms' },
  ];

  constructor() {
    effect(() => {
      const c = this.content();
      const p = this.page();
      untracked(() => {
        this.open.set(0);
        if (c) this.seo.set({ title: c.title, description: c.lead, path: `/${p}` });
      });
    });
  }
}
