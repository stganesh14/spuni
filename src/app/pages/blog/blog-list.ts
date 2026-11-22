import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../core/api/api.service';
import { BlogPostCard, Page } from '../../core/api/models';
import { MotionService } from '../../core/motion/motion.service';
import { SeoService } from '../../core/seo/seo.service';

@Component({
  selector: 'app-blog-list-page',
  imports: [RouterLink, DatePipe],
  template: `
    <main class="journal">
      <header class="journal-hero">
        <p class="eyebrow" data-aos="fade-up">Notes from the atelier</p>
        <h1 data-aos="fade-up" data-aos-delay="80">The SPUNI <em>journal.</em></h1>
        <p data-aos="fade-up" data-aos-delay="140">
          Stories about thoughtful design, considered materials and the people behind every piece.
        </p>
      </header>

      <section class="journal-content container" aria-label="Blog posts">
        @if (loading() && !result()) {
          <p class="state" role="status">Loading stories…</p>
        } @else if (error()) {
          <div class="state error" role="alert">
            <p>{{ error() }}</p>
            <button type="button" class="button" (click)="load(page())">Try again</button>
          </div>
        } @else if (result(); as pageResult) {
          @if (!pageResult.items.length) {
            <p class="state">New stories are on their way. Please check back soon.</p>
          } @else {
            <div class="post-grid">
              @for (post of pageResult.items; track post.slug; let i = $index) {
                <a class="post-card" [routerLink]="['/blog', post.slug]" data-aos="fade-up" [attr.data-aos-delay]="(i % 3) * 80">
                  <div class="post-image">
                    @if (post.image_url) {
                      <img [src]="post.image_url" [alt]="post.title" loading="lazy" />
                    } @else {
                      <span aria-hidden="true">SPUNI</span>
                    }
                    <i class="bi bi-arrow-up-right" aria-hidden="true"></i>
                  </div>
                  <div class="post-copy">
                    <time [attr.datetime]="post.published_at">{{ post.published_at | date: 'd MMM yyyy' }}</time>
                    <h2>{{ post.title }}</h2>
                    @if (post.excerpt) { <p>{{ post.excerpt }}</p> }
                    <span class="read-more">Read story <i class="bi bi-arrow-right"></i></span>
                  </div>
                </a>
              }
            </div>

            @if (pageResult.pages > 1) {
              <nav class="pagination" aria-label="Blog pages">
                <button type="button" class="button" [disabled]="page() <= 1 || loading()" (click)="load(page() - 1)">Previous</button>
                <span>Page {{ page() }} of {{ pageResult.pages }}</span>
                <button type="button" class="button" [disabled]="page() >= pageResult.pages || loading()" (click)="load(page() + 1)">Next</button>
              </nav>
            }
          }
        }
      </section>
    </main>
  `,
  styleUrl: './blog-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlogListPage {
  private readonly api = inject(Api);
  private readonly motion = inject(MotionService);
  private readonly seo = inject(SeoService);
  protected readonly result = signal<Page<BlogPostCard> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly page = signal(1);

  constructor() {
    this.seo.set({
      title: 'Journal',
      description: 'Stories about SPUNI craftsmanship, considered materials and thoughtful design.',
      path: '/blog',
    });
    void this.load(1);
  }

  protected async load(page: number): Promise<void> {
    this.page.set(page);
    this.loading.set(true);
    this.error.set(null);
    try {
      this.result.set(await firstValueFrom(this.api.blogs(page)));
      setTimeout(() => this.motion.refresh(), 300);
    } catch {
      this.error.set('We couldn’t load the journal. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
