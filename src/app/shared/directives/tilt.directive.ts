import { Directive, numberAttribute, ElementRef, NgZone, OnDestroy, afterNextRender, inject, input } from '@angular/core';
import { gsap } from 'gsap';

import { MotionService } from '../../core/motion/motion.service';

/** 3D tilt toward the cursor with a moving glare highlight (desktop only). */
@Directive({ selector: '[appTilt]' })
export class TiltDirective implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly motion = inject(MotionService);
  readonly appTilt = input(8, { transform: (v: unknown) => numberAttribute(v, 8) });
  private cleanup?: () => void;

  constructor() {
    afterNextRender(() => {
      if (!this.motion.finePointer() || this.motion.reduced()) return;
      const node = this.el.nativeElement;
      const max = this.appTilt();
      gsap.set(node, { transformPerspective: 900 });
      const rx = gsap.quickTo(node, 'rotationX', { duration: 0.5, ease: 'power3.out' });
      const ry = gsap.quickTo(node, 'rotationY', { duration: 0.5, ease: 'power3.out' });
      const move = (e: PointerEvent) => {
        const r = node.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        ry((px - 0.5) * max * 2);
        rx(-(py - 0.5) * max * 2);
        node.style.setProperty('--glare-x', `${px * 100}%`);
        node.style.setProperty('--glare-y', `${py * 100}%`);
      };
      const leave = () => {
        rx(0);
        ry(0);
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
