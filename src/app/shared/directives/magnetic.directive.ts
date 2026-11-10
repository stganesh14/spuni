import { Directive, numberAttribute, ElementRef, NgZone, OnDestroy, afterNextRender, inject, input } from '@angular/core';
import { gsap } from 'gsap';

import { MotionService } from '../../core/motion/motion.service';

/** Element gently follows the cursor while hovered (desktop only). */
@Directive({ selector: '[appMagnetic]' })
export class MagneticDirective implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly motion = inject(MotionService);
  readonly appMagnetic = input(0.35, { transform: (v: unknown) => numberAttribute(v, 0.35) });
  private cleanup?: () => void;

  constructor() {
    afterNextRender(() => {
      if (!this.motion.finePointer() || this.motion.reduced()) return;
      const node = this.el.nativeElement;
      const strength = this.appMagnetic();
      const xTo = gsap.quickTo(node, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
      const yTo = gsap.quickTo(node, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
      const move = (e: PointerEvent) => {
        const r = node.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * strength);
        yTo((e.clientY - (r.top + r.height / 2)) * strength);
      };
      const leave = () => {
        xTo(0);
        yTo(0);
      };
      this.zone.runOutsideAngular(() => {
        node.addEventListener('pointermove', move);
        node.addEventListener('pointerleave', leave);
      });
      this.cleanup = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerleave', leave);
      };
    });
  }

  ngOnDestroy(): void {
    this.cleanup?.();
  }
}
