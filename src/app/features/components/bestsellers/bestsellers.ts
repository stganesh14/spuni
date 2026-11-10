import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProductCard } from '../../../core/api/models';
import { MotionService } from '../../../core/motion/motion.service';
import { ProductCardComponent } from '../../../shared/components/product-card/product-card';
import { RevealTextDirective } from '../../../shared/directives/reveal-text.directive';

/** "Most loved" rail: swipeable on touch, draggable with a mouse, filterable by category. */
@Component({
  selector: 'app-bestsellers',
  imports: [RouterLink, ProductCardComponent, RevealTextDirective],
  templateUrl: './bestsellers.html',
  styleUrl: './bestsellers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Bestsellers {
  private readonly motion = inject(MotionService);
  private readonly rail = viewChild<ElementRef<HTMLElement>>('rail');

  readonly products = input<ProductCard[]>([]);
  readonly eyebrow = input('Bestsellers');
  readonly heading = input('Most loved, most carried');

  protected readonly filter = signal<string | null>(null);
  protected readonly progress = signal(0);
  protected readonly categories = computed(() => {
    const seen = new Map<string, string>();
    for (const p of this.products()) seen.set(p.category.slug, p.category.name);
    return [...seen].map(([slug, name]) => ({ slug, name }));
  });
  protected readonly visible = computed(() => {
    const f = this.filter();
    return f ? this.products().filter((p) => p.category.slug === f) : this.products();
  });

  private drag: { x: number; left: number; moved: boolean } | null = null;

  setFilter(slug: string | null): void {
    this.filter.set(slug);
    this.rail()?.nativeElement.scrollTo({ left: 0, behavior: this.motion.reduced() ? 'auto' : 'smooth' });
  }

  scrollBy(direction: 1 | -1): void {
    const el = this.rail()?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  onScroll(): void {
    const el = this.rail()?.nativeElement;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    this.progress.set(max > 0 ? el.scrollLeft / max : 0);
  }

  onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const el = this.rail()?.nativeElement;
    if (!el) return;
    this.drag = { x: event.clientX, left: el.scrollLeft, moved: false };
  }

  onPointerMove(event: PointerEvent): void {
    const el = this.rail()?.nativeElement;
    if (!this.drag || !el) return;
    const dx = event.clientX - this.drag.x;
    if (Math.abs(dx) > 5) {
      this.drag.moved = true;
      el.classList.add('dragging');
    }
    el.scrollLeft = this.drag.left - dx;
  }

  onPointerUp(): void {
    const el = this.rail()?.nativeElement;
    el?.classList.remove('dragging');
    const moved = this.drag?.moved;
    this.drag = null;
    if (moved && el) {
      // Swallow the click that ends a drag so cards don't open.
      el.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true });
    }
  }
}
