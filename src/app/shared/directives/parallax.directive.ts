import { Directive, numberAttribute, ElementRef, NgZone, OnDestroy, afterNextRender, inject, input } from '@angular/core';
import { gsap } from 'gsap';

import { MotionService } from '../../core/motion/motion.service';

/** Scroll-linked drift. `[appParallax]="-15"` moves the element by yPercent. */
@Directive({ selector: '[appParallax]' })
export class ParallaxDirective implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly motion = inject(MotionService);
  readonly appParallax = input(-12, { transform: (v: unknown) => numberAttribute(v, -12) });
  readonly parallaxScale = input<number | null>(null);
  private ctx?: gsap.Context;

  constructor() {
    afterNextRender(() => {
      if (this.motion.reduced()) return;
      this.zone.runOutsideAngular(() => {
        const node = this.el.nativeElement;
        const amount = this.appParallax();
        this.ctx = gsap.context(() => {
          gsap.fromTo(
            node,
            { yPercent: -amount / 2, scale: this.parallaxScale() ?? 1 },
            {
              yPercent: amount / 2,
              scale: 1,
              ease: 'none',
              scrollTrigger: { trigger: node.parentElement ?? node, start: 'top bottom', end: 'bottom top', scrub: true },
            },
          );
        });
      });
    });
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
  }
}
