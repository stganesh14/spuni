import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Api } from '../../core/api/api.service';
import { Customization } from '../../core/api/models';
import { CUSTOMIZATION_STATUS_LABEL, statusTone } from '../../core/utils/labels';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ZoomableDirective } from '../../shared/directives/zoomable.directive';
import { InrPipe } from '../../shared/pipes/inr.pipe';

const KIND: Record<Customization['kind'], string> = {
  catalog: 'Personalise a piece',
  upload: 'Your design',
  expert: 'Expert consultation',
};

@Component({
  selector: 'app-account-customizations',
  imports: [RouterLink, DatePipe, InrPipe, EmptyState, ZoomableDirective],
  template: `
    <section class="panel">
      <div class="row"><h2>Customisation requests</h2>
        <a class="btn btn-sm" routerLink="/customization"><i class="bi bi-plus"></i> New request</a></div>
      @for (c of items(); track c.reference) {
        <article class="req">
          <header>
            <div><b>{{ c.reference }}</b><small>{{ kind[c.kind] }} · {{ c.created_at | date: 'd MMM y' }}</small></div>
            <span class="status-pill" [class]="'status-pill ' + tone(c.status)">{{ statusLabel[c.status] || c.status }}</span>
          </header>
          @if (c.product_name) { <p class="prod">For <a [routerLink]="['/product', c.product_slug]">{{ c.product_name }}</a></p> }
          <p>{{ c.details }}</p>
          @if (c.files.length) {
            <div class="files">
              @for (f of c.files; track f.id) {
                @if (f.content_type === 'application/pdf') {
                  <a class="pdf" [href]="f.url" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf"></i>
                    {{ f.original_name }}</a>
                } @else {
                  <img [src]="f.url" [alt]="f.original_name" loading="lazy" [appZoomable]="f.url" [zoomTitle]="f.original_name" />
                }
              }
            </div>
          }
          @if (c.quoted_price_paise) { <p class="quote"><i class="bi bi-tag"></i> Quoted price <b>{{ c.quoted_price_paise | inr }}</b></p> }
          @if (c.customer_visible_note) { <p class="note"><i class="bi bi-chat-quote"></i> {{ c.customer_visible_note }}</p> }
        </article>
      } @empty {
        @if (loaded()) {
          <app-empty-state icon="bi-magic" title="No requests yet" text="Tell us what you're imagining and our artisans will get back within 48 hours."
                           actionLink="/customization" actionLabel="Start a request" />
        }
      }
    </section>
  `,
  styles: `
    .panel { background: var(--paper); }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
    h2 { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: 1.4rem; }
    .req { padding: 16px 0; border-top: 1px solid var(--line); }
    .req header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
    .req header div { display: grid; } .req header small { color: var(--muted); }
    .req p { margin: 10px 0 0; color: var(--brown-soft); white-space: pre-line; }
    .files { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .pdf { display: inline-flex; gap: 6px; align-items: center; padding: 8px 12px; border-radius: 10px; background: var(--cream); font-size: .8rem; }
    .files img { width: 72px; height: 72px; object-fit: cover; border-radius: 10px; }
    .quote, .note { padding: 8px 12px; border-radius: 10px; background: var(--cream); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountCustomizations {
  private readonly api = inject(Api);
  protected readonly kind = KIND;
  protected readonly statusLabel = CUSTOMIZATION_STATUS_LABEL;
  protected readonly tone = statusTone;
  protected readonly items = signal<Customization[]>([]);
  protected readonly loaded = signal(false);

  constructor() {
    this.api.myCustomizations().subscribe({
      next: (c) => {
        this.items.set(c);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }
}
