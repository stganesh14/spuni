import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { Banner } from '../../../core/api/models';
import { MotionService } from '../../../core/motion/motion.service';
import { Loader } from '../../../core/services/loader';
import { MagneticDirective } from '../../../shared/directives/magnetic.directive';
import { ParallaxDirective } from '../../../shared/directives/parallax.directive';

const SLIDE_MS = 6500;

/** Full-bleed hero slideshow driven by admin-managed banners. */
@Component({
  selector: 'app-hero',
  imports: [RouterLink, MagneticDirective, ParallaxDirective],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hero {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly loader = inject(Loader);
  private readonly motion = inject(MotionService);

  readonly banners = input<Banner[]>([]);

  protected readonly current = signal(0);
  protected readonly playing = signal(false);
  protected readonly slide = computed<Banner | null>(() => this.banners()[this.current()] ?? null);
  protected readonly ready = computed(() => !this.loader.booting());
  protected readonly titleOne = computed(() => this.chars(this.slide()?.title_one));
  protected readonly titleTwo = computed(() => this.chars(this.slide()?.title_two));
  protected readonly slideMs = SLIDE_MS;

  private timer?: ReturnType<typeof setInterval>;
  private touchX: number | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      const count = this.banners().length;
      const ready = this.ready();
      untracked(() => {
        if (this.isBrowser && ready && count > 1 && !this.motion.reduced()) this.start();
      });
    });
    destroyRef.onDestroy(() => this.stop());
    if (this.isBrowser) {
      const onVisibility = () => {
        if (document.hidden) this.stop();
        else if (this.playing()) this.start();
      };
      document.addEventListener('visibilitychange', onVisibility);
      destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVisibility));
    }
  }

  go(index: number): void {
    const count = this.banners().length;
    if (!count) return;
    this.current.set((index + count) % count);
    if (this.playing()) this.start();
  }

  onTouchStart(event: TouchEvent): void {
    this.touchX = event.touches[0]?.clientX ?? null;
  }

  onTouchEnd(event: TouchEvent): void {
    if (this.touchX === null) return;
    const dx = (event.changedTouches[0]?.clientX ?? this.touchX) - this.touchX;
    if (Math.abs(dx) > 50) this.go(this.current() + (dx < 0 ? 1 : -1));
    this.touchX = null;
  }

  scrollDown(): void {
    this.motion.scrollTo(window.innerHeight * 0.92);
  }

  private start(): void {
    this.stop();
    if (this.banners().length < 2) return;
    this.playing.set(true);
    this.timer = setInterval(() => this.current.update((i) => (i + 1) % this.banners().length), SLIDE_MS);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private chars(text: string | null | undefined): string[] {
    return (text ?? '').split('');
  }
}
