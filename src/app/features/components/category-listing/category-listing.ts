import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  afterNextRender,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { Category } from '../../../core/api/models';
import { MotionService } from '../../../core/motion/motion.service';
import { RevealTextDirective } from '../../../shared/directives/reveal-text.directive';
import { ZoomableDirective } from '../../../shared/directives/zoomable.directive';

/**
 * Layout presets cycle so any number of categories gets an organic, floating collage.
 * One cycle fills exactly two rows of the 4-column desktop grid (tall 2 + wide 2 + 4 × base = 8 cells):
 *   [ tall ][   wide   ][ base ]
 *   [ tall ][base][base][ base ]
 */
const SHAPES = [
  { span: 'tall', depth: 26, dur: 6.2, rot: -2.5 },
  { span: 'wide', depth: 14, dur: 7.4, rot: 1.5 },
  { span: 'base', depth: 34, dur: 5.6, rot: 2.5 },
  { span: 'base', depth: 18, dur: 6.8, rot: -1.5 },
  { span: 'base', depth: 30, dur: 7.9, rot: -2 },
  { span: 'base', depth: 12, dur: 6.5, rot: 2 },
];

/**
 * Category collage: every card floats on its own rhythm, drifts with the
 * pointer at a different depth, and the whole set assembles from a scattered
 * pile as you scroll in.
 */
@Component({
  selector: 'app-category-listing',
  imports: [RouterLink, RevealTextDirective, ZoomableDirective],
  templateUrl: './category-listing.html',
  styleUrl: './category-listing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryListing {
  private readonly motion = inject(MotionService);
  private readonly zone = inject(NgZone);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');

  readonly categories = input<Category[]>([]);
  readonly heading = input(true);

  protected readonly particles = Array.from({ length: 14 }, (_, i) => ({
    left: (i * 37) % 100,
    top: (i * 53) % 100,
    size: 4 + ((i * 7) % 9),
    dur: 9 + ((i * 5) % 9),
    delay: -((i * 3) % 11),
    kind: i % 3,
  }));

  private ctx?: gsap.Context;
  private rendered = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.ctx?.revert());

    afterNextRender(() => {
      this.rendered = true;
      this.animate();
      const stage = this.stage()?.nativeElement;
      if (!stage || !this.motion.finePointer() || this.motion.reduced()) return;
      this.zone.runOutsideAngular(() => {
        const mx = gsap.quickTo(stage, '--mx', { duration: 1.2, ease: 'power3.out' });
        const my = gsap.quickTo(stage, '--my', { duration: 1.2, ease: 'power3.out' });
        stage.addEventListener('pointermove', (e) => {
          const r = stage.getBoundingClientRect();
          mx(((e.clientX - r.left) / r.width - 0.5) * 2);
          my(((e.clientY - r.top) / r.height - 0.5) * 2);
        });
        stage.addEventListener('pointerleave', () => {
          mx(0);
          my(0);
        });
      });
    });

    // Rebuild the entrance once categories arrive.
    effect(() => {
      this.categories();
      untracked(() => this.rendered && requestAnimationFrame(() => this.animate()));
    });
  }

  protected shape(i: number) {
    return SHAPES[i % SHAPES.length];
  }

  private animate(): void {
    const stage = this.stage()?.nativeElement;
    if (!stage || this.motion.reduced()) return;
    this.ctx?.revert();
    this.zone.runOutsideAngular(() => {
      this.ctx = gsap.context(() => {
        const cards = gsap.utils.toArray<HTMLElement>('.cat');
        if (!cards.length) return;
        gsap.from(cards, {
          x: () => gsap.utils.random(-160, 160),
          y: () => gsap.utils.random(120, 260),
          rotate: () => gsap.utils.random(-14, 14),
          scale: 0.82,
          autoAlpha: 0,
          duration: 1.4,
          ease: 'expo.out',
          stagger: { each: 0.08, from: 'random' },
          scrollTrigger: { trigger: stage, start: 'top 82%', once: true },
        });
        gsap.to('.cat-name', {
          yPercent: -18,
          ease: 'none',
          scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
        });
      }, stage);
      ScrollTrigger.refresh();
    });
  }
}
