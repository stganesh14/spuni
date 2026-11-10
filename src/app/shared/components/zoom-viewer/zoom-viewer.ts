import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { gsap } from 'gsap';

import { MotionService } from '../../../core/motion/motion.service';
import { ZoomService } from '../../../core/ui/zoom.service';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const STEP = 0.6;

@Component({
  selector: 'app-zoom-viewer',
  imports: [RouterLink],
  templateUrl: './zoom-viewer.html',
  styleUrl: './zoom-viewer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZoomViewer {
  protected readonly zoom = inject(ZoomService);
  private readonly motion = inject(MotionService);

  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly image = viewChild<ElementRef<HTMLImageElement>>('image');
  private readonly overlay = viewChild<ElementRef<HTMLElement>>('overlay');

  protected readonly request = this.zoom.request;
  protected readonly index = signal(0);
  protected readonly scale = signal(1);
  protected readonly x = signal(0);
  protected readonly y = signal(0);
  protected readonly dragging = signal(false);
  protected readonly loaded = signal(false);

  protected readonly current = computed(() => {
    const req = this.request();
    return req ? req.images[this.index()] ?? req.images[0] : null;
  });
  protected readonly percent = computed(() => Math.round(this.scale() * 100));
  protected readonly transform = computed(
    () => `translate3d(${this.x()}px, ${this.y()}px, 0) scale(${this.scale()})`,
  );

  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStart: { distance: number; scale: number } | null = null;
  private dragStart: { x: number; y: number; ox: number; oy: number } | null = null;
  private lastTap = 0;
  private isOpen = false;

  constructor() {
    effect(() => {
      const req = this.request();
      untracked(() => {
        if (req && !this.isOpen) {
          this.isOpen = true;
          this.index.set(req.index);
          this.reset();
          this.motion.lockScroll();
          requestAnimationFrame(() => this.animateIn(req.origin ?? null));
        } else if (!req && this.isOpen) {
          this.isOpen = false;
          this.motion.unlockScroll();
        }
      });
    });
  }

  // --------------------------------------------------------------- actions

  close(): void {
    const overlay = this.overlay()?.nativeElement;
    if (!overlay || this.motion.reduced()) {
      this.zoom.close();
      return;
    }
    gsap.to(overlay, { autoAlpha: 0, duration: 0.3, ease: 'power2.in', onComplete: () => this.zoom.close() });
  }

  zoomIn(): void {
    this.setScale(this.scale() + STEP);
  }

  zoomOut(): void {
    this.setScale(this.scale() - STEP);
  }

  reset(): void {
    this.scale.set(1);
    this.x.set(0);
    this.y.set(0);
  }

  go(delta: number): void {
    const req = this.request();
    if (!req || req.images.length < 2) return;
    const next = (this.index() + delta + req.images.length) % req.images.length;
    this.select(next);
  }

  select(i: number): void {
    if (i === this.index()) return;
    this.loaded.set(false);
    this.reset();
    this.index.set(i);
  }

  onLoad(): void {
    this.loaded.set(true);
  }

  // ------------------------------------------------------- input handlers

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (!this.request()) return;
    switch (event.key) {
      case 'Escape':
        this.close();
        break;
      case '+':
      case '=':
        this.zoomIn();
        break;
      case '-':
      case '_':
        this.zoomOut();
        break;
      case '0':
        this.reset();
        break;
      case 'ArrowRight':
        this.go(1);
        break;
      case 'ArrowLeft':
        this.go(-1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.zoomAt(this.scale() * factor, event.clientX, event.clientY);
  }

  onDoubleClick(event: MouseEvent): void {
    if (this.scale() > 1.05) this.reset();
    else this.zoomAt(2.5, event.clientX, event.clientY);
  }

  onPointerDown(event: PointerEvent): void {
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale() };
      this.dragStart = null;
    } else if (this.pointers.size === 1) {
      if (event.pointerType === 'touch') {
        const now = Date.now();
        if (now - this.lastTap < 280) {
          if (this.scale() > 1.05) this.reset();
          else this.zoomAt(2.5, event.clientX, event.clientY);
        }
        this.lastTap = now;
      }
      this.dragStart = { x: event.clientX, y: event.clientY, ox: this.x(), oy: this.y() };
    }
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pinchStart && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoomAt(this.pinchStart.scale * (distance / this.pinchStart.distance), (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (this.dragStart && this.scale() > 1) {
      this.dragging.set(true);
      this.x.set(this.dragStart.ox + event.clientX - this.dragStart.x);
      this.y.set(this.dragStart.oy + event.clientY - this.dragStart.y);
      this.clampPan();
    }
  }

  onPointerUp(event: PointerEvent): void {
    const start = this.dragStart;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchStart = null;
    if (this.pointers.size === 0) {
      // swipe between images when not zoomed
      if (start && this.scale() <= 1.01 && event.pointerType !== 'mouse') {
        const dx = event.clientX - start.x;
        if (Math.abs(dx) > 60) this.go(dx < 0 ? 1 : -1);
      }
      this.dragStart = null;
      this.dragging.set(false);
    }
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget && this.scale() <= 1.01) this.close();
  }

  // -------------------------------------------------------------- helpers

  private setScale(value: number): void {
    const rect = this.stage()?.nativeElement.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    this.zoomAt(value, cx, cy);
  }

  /** Zoom keeping the point under (clientX, clientY) fixed. */
  private zoomAt(target: number, clientX: number, clientY: number): void {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, target));
    const stage = this.stage()?.nativeElement;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const px = clientX - (rect.left + rect.width / 2);
    const py = clientY - (rect.top + rect.height / 2);
    const ratio = next / this.scale();
    this.x.set(px - (px - this.x()) * ratio);
    this.y.set(py - (py - this.y()) * ratio);
    this.scale.set(next);
    if (next <= 1) {
      this.x.set(0);
      this.y.set(0);
    }
    this.clampPan();
  }

  private clampPan(): void {
    const img = this.image()?.nativeElement;
    const stage = this.stage()?.nativeElement;
    if (!img || !stage) return;
    const s = this.scale();
    const maxX = Math.max(0, (img.offsetWidth * s - stage.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * s - stage.clientHeight) / 2);
    this.x.set(Math.max(-maxX, Math.min(maxX, this.x())));
    this.y.set(Math.max(-maxY, Math.min(maxY, this.y())));
  }

  private animateIn(origin: DOMRect | null): void {
    const overlay = this.overlay()?.nativeElement;
    const img = this.image()?.nativeElement;
    if (!overlay) return;
    if (this.motion.reduced()) {
      gsap.set(overlay, { autoAlpha: 1 });
      return;
    }
    gsap.fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: 'power2.out' });
    gsap.fromTo('.zv-chrome', { y: 20, autoAlpha: 0 }, {
      y: 0, autoAlpha: 1, duration: 0.6, delay: 0.15, stagger: 0.06, ease: 'power3.out',
    });
    if (img && origin && origin.width > 0) {
      const target = img.getBoundingClientRect();
      if (target.width > 0) {
        const sx = origin.width / target.width;
        const dx = origin.left + origin.width / 2 - (target.left + target.width / 2);
        const dy = origin.top + origin.height / 2 - (target.top + target.height / 2);
        gsap.fromTo(img, { x: dx, y: dy, scale: sx, opacity: 0.6 },
          { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.75, ease: 'expo.out', clearProps: 'transform,opacity' });
        return;
      }
    }
    if (img) gsap.fromTo(img, { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'expo.out',
      clearProps: 'transform,opacity' });
  }
}
