import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../core/api/api.service';
import { BlogPost } from '../../core/api/models';
import { MotionService } from '../../core/motion/motion.service';
import { SeoService } from '../../core/seo/seo.service';

@Component({
  selector: 'app-blog-detail-page',
  imports: [RouterLink, DatePipe],
  template: `
    <main class="article-page">
      @if (loading()) {
        <p class="state" role="status">Loading story…</p>
      } @else if (error()) {
        <section class="state error" role="alert">
          <h1>Story unavailable</h1>
          <p>{{ error() }}</p>
          <a class="button" routerLink="/blog">Back to the journal</a>
        </section>
      } @else if (post(); as story) {
        <article class="article">
          <header class="article-heading">
            <a class="back" routerLink="/blog"><i class="bi bi-arrow-left"></i> Journal</a>
            <time [attr.datetime]="story.published_at">{{ story.published_at | date: 'd MMMM yyyy' }}</time>
            <h1>{{ story.title }}</h1>
            @if (story.excerpt) { <p class="lead">{{ story.excerpt }}</p> }
          </header>

          @if (story.image_url) {
            <figure class="article-cover" data-aos="fade-up">
              <img [src]="story.image_url" [alt]="story.title" fetchpriority="high" />
            </figure>
          }

          <div class="article-content" [innerHTML]="story.content"></div>
          <footer class="article-footer">
            <span>Made slowly. Carried forever.</span>
            <a routerLink="/blog">More stories <i class="bi bi-arrow-right"></i></a>
          </footer>
        </article>
      }
    </main>
  `,
  styleUrl: './blog-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlogDetailPage implements OnDestroy {
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly motion = inject(MotionService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly zone = inject(NgZone);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly post = signal<BlogPost | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private context?: gsap.Context;
  private loadSequence = 0;
  private animationTimer?: number;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const slug = params.get('slug');
      if (slug) void this.load(slug);
    });
  }

  private async load(slug: string): Promise<void> {
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    this.error.set(null);
    this.post.set(null);
    try {
      const post = await firstValueFrom(this.api.blog(slug));
      if (sequence !== this.loadSequence) return;
      this.post.set(post);
      this.seo.set({
        title: post.title,
        description: post.excerpt,
        image: post.image_url,
        path: `/blog/${post.slug}`,
      });
      setTimeout(() => this.motion.refresh(), 300);
      if (this.browser && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.animationTimer = window.setTimeout(() => {
          if (sequence === this.loadSequence) this.animateArticle();
        }, 50);
      }
    } catch {
      if (sequence === this.loadSequence) {
        this.error.set('We couldn’t find this story. It may have been removed or unpublished.');
      }
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }

  private animateArticle(): void {
    this.context?.revert();
    this.zone.runOutsideAngular(() => {
      gsap.registerPlugin(ScrollTrigger);
      this.context = gsap.context(() => {
        gsap.from('.article-heading > *', {
          autoAlpha: 0,
          y: 22,
          duration: 0.75,
          stagger: 0.1,
          ease: 'power3.out',
        });
        gsap.from('.article-content > *', {
          autoAlpha: 0,
          y: 18,
          duration: 0.6,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: { trigger: '.article-content', start: 'top 88%', once: true },
        });
      }, this.host.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.loadSequence++;
    if (this.animationTimer) window.clearTimeout(this.animationTimer);
    this.context?.revert();
  }
}
