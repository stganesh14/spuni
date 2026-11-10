import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

const SITE = 'SPUNI';
const DEFAULT_DESCRIPTION =
  'SPUNI crafts timeless vegan leather bags, wallets, belts and travel goods in Chennai. Made slowly. Carried forever.';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  set(opts: { title?: string; description?: string | null; image?: string | null; path?: string }): void {
    const fullTitle = opts.title ? `${opts.title} · ${SITE}` : `${SITE} · Handcrafted Vegan Leather`;
    const description = (opts.description || DEFAULT_DESCRIPTION).slice(0, 300);
    this.title.setTitle(fullTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    if (opts.image) this.meta.updateTag({ property: 'og:image', content: opts.image });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    if (opts.path !== undefined) this.canonical(opts.path);
  }

  private canonical(path: string): void {
    const head = this.document.head;
    if (!head) return;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', path);
  }
}
