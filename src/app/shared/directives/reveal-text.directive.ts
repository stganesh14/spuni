import { Directive, ElementRef, NgZone, OnDestroy, afterNextRender, inject, input } from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

import { MotionService } from '../../core/motion/motion.service';

/**
 * Kinetic headline: splits text into lines/words/chars and reveals them when
 * scrolled into view. `appRevealText="chars"` for a letter-by-letter rise.
 */
@Directive({ selector: '[appRevealText]' })
export class RevealTextDirective implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly motion = inject(MotionService);
  readonly appRevealText = input<'lines' | 'words' | 'chars' | ''>('lines');
  readonly revealDelay = input(0);
  private ctx?: gsap.Context;
  private split?: SplitText;

  constructor() {
    afterNextRender(() => {
      if (this.motion.reduced()) return;
      this.zone.runOutsideAngular(() => {
        const node = this.el.nativeElement;
        const mode = this.appRevealText() || 'lines';
        document.fonts?.ready.then(() => {
          if (!node.isConnected) return;
          this.ctx = gsap.context(() => {
            this.split = SplitText.create(node, {
              type: mode === 'chars' ? 'lines,words,chars' : mode === 'words' ? 'lines,words' : 'lines',
              mask: 'lines',
              linesClass: 'split-line',
              autoSplit: true,
              onSplit: (self) => {
                const targets = mode === 'chars' ? self.chars : mode === 'words' ? self.words : self.lines;
                return gsap.from(targets, {
                  yPercent: 110,
                  rotate: mode === 'chars' ? 8 : 2,
                  opacity: 0,
                  duration: mode === 'chars' ? 0.9 : 1.1,
                  ease: 'expo.out',
                  stagger: mode === 'chars' ? 0.025 : 0.09,
                  delay: this.revealDelay(),
                  scrollTrigger: { trigger: node, start: 'top 88%', once: true },
                });
              },
            });
          }, node);
          ScrollTrigger.refresh();
        });
      });
    });
  }

  ngOnDestroy(): void {
    this.split?.revert();
    this.ctx?.revert();
  }
}
