import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { gsap } from 'gsap';

import { Loader } from '../../../core/services/loader';
import { safeStorage } from '../../../core/utils/storage';

const SEEN_KEY = 'spuni.intro';
const WORD = 'SPUNI';
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&@*+?!◆✦';
const TEASERS = [
  'Selecting the hide',
  'Cutting the pattern',
  'Hand-stitching, 8 per inch',
  'Burnishing the edges',
  'Something new is dropping soon',
  'Opening the atelier',
];

/**
 * First-visit intro: kinetic letter scramble, a stitch that sews across the
 * screen with a live percentage, rotating teaser lines, then the "bag flap"
 * opens onto the page. The site is server-rendered underneath, so the intro
 * never delays content; repeat visits in a session skip it entirely.
 */
@Component({
  selector: 'app-premium-loader',
  templateUrl: './premium-loader.html',
  styleUrl: './premium-loader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PremiumLoader {
  protected readonly loader = inject(Loader);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly root = viewChild<ElementRef<HTMLElement>>('root');

  protected readonly letters = signal<string[]>(WORD.split('').map(() => '◆'));
  protected readonly locked = signal<boolean[]>(WORD.split('').map(() => false));
  protected readonly percent = signal(0);
  protected readonly teaser = signal(TEASERS[0]);
  protected readonly teaserKey = signal(0);
  protected readonly ready = signal(false);

  private timeline?: gsap.core.Timeline;

  constructor() {
    afterNextRender(() => {
      if (!this.isBrowser) return;
      if (safeStorage.session(SEEN_KEY) === '1') {
        this.finish();
        return;
      }
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) this.playReduced();
      else this.play();
    });
  }

  skip(): void {
    if (this.timeline) this.timeline.progress(0.86);
    else this.finish();
  }

  private play(): void {
    const root = this.root()?.nativeElement;
    if (!root) {
      this.finish();
      return;
    }
    const q = gsap.utils.selector(root);
    const counter = { value: 0 };
    let teaserIndex = 0;
    let lastTeaser = 0;

    const tl = gsap.timeline({ onComplete: () => this.finish() });
    this.timeline = tl;

    tl.from(q('.tag'), { y: -220, rotate: -28, duration: 1.1, ease: 'elastic.out(1, 0.45)' }, 0)
      .from(q('.l'), { yPercent: 120, rotate: 12, stagger: 0.05, duration: 0.7, ease: 'back.out(2)' }, 0.05)
      .from(q('.meta > *, .skip'), { autoAlpha: 0, y: 10, stagger: 0.06, duration: 0.5 }, 0.2)
      .to(counter, {
        value: 100,
        duration: 1.9,
        ease: 'power2.inOut',
        onUpdate: () => {
          const pct = Math.round(counter.value);
          this.percent.set(pct);
          this.scramble(tl.time());
          const elapsed = tl.time();
          if (elapsed - lastTeaser > 0.38 && teaserIndex < TEASERS.length - 1) {
            lastTeaser = elapsed;
            teaserIndex++;
            this.teaser.set(TEASERS[teaserIndex]);
            this.teaserKey.update((k) => k + 1);
          }
        },
      }, 0.15)
      .fromTo(q('.stitch-path'), { strokeDashoffset: 1000 }, { strokeDashoffset: 0, duration: 1.9, ease: 'power2.inOut' }, 0.15)
      .fromTo(q('.needle'), { left: '0%' }, { left: '100%', duration: 1.9, ease: 'power2.inOut' }, 0.15)
      .add(() => {
        this.letters.set(WORD.split(''));
        this.locked.set(WORD.split('').map(() => true));
        this.ready.set(true);
      })
      .to(q('.word'), { scale: 1.06, duration: 0.25, ease: 'power2.out' })
      .to(q('.word'), { scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' })
      .to(q('.stage'), { autoAlpha: 0, y: -30, duration: 0.45, ease: 'power2.in' }, '+=0.15')
      .to(q('.flap-top'), { yPercent: -101, duration: 0.95, ease: 'expo.inOut' }, '<0.1')
      .to(q('.flap-bottom'), { yPercent: 101, duration: 0.95, ease: 'expo.inOut' }, '<')
      .to(q('.seam'), { scaleX: 0, duration: 0.5, ease: 'power2.in' }, '<');
  }

  private playReduced(): void {
    this.letters.set(WORD.split(''));
    this.percent.set(100);
    const root = this.root()?.nativeElement;
    if (!root) {
      this.finish();
      return;
    }
    gsap.to(root, { autoAlpha: 0, duration: 0.4, delay: 0.5, onComplete: () => this.finish() });
  }

  /** Each letter flickers through random glyphs, then locks in one after another. */
  private scramble(time: number): void {
    const lockAt = [0.7, 0.95, 1.2, 1.45, 1.7];
    const locked = lockAt.map((t) => time >= t);
    this.locked.set(locked);
    this.letters.set(
      WORD.split('').map((ch, i) => (locked[i] ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])),
    );
  }

  private finish(): void {
    safeStorage.setSession(SEEN_KEY, '1');
    this.document.documentElement.classList.add('intro-seen');
    this.timeline?.kill();
    this.timeline = undefined;
    this.loader.finishBoot();
  }
}
