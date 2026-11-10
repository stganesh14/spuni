import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, NgZone, PLATFORM_ID, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import AOS from 'aos';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { filter } from 'rxjs';

/**
 * One place for site-wide motion: Lenis smooth scrolling synced with GSAP's
 * ticker and ScrollTrigger, AOS, route scroll handling and reduced-motion.
 */
@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly zone = inject(NgZone);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  readonly reduced = signal(false);
  readonly finePointer = signal(false);
  readonly scrollProgress = signal(0);
  readonly scrollY = signal(0);
  readonly velocity = signal(0);

  private lenis?: Lenis;
  private started = false;
  private lockCount = 0;

  init(): void {
    if (!this.isBrowser || this.started) return;
    this.started = true;
    gsap.registerPlugin(ScrollTrigger, SplitText, Flip);

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced.set(media.matches);
    media.addEventListener?.('change', (e) => this.reduced.set(e.matches));
    this.finePointer.set(window.matchMedia('(hover: hover) and (pointer: fine)').matches);

    this.zone.runOutsideAngular(() => {
      if (!this.reduced()) {
        this.lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 1, autoRaf: false });
        this.lenis.on('scroll', (l: Lenis) => {
          ScrollTrigger.update();
          this.velocity.set(l.velocity);
          this.scrollY.set(l.scroll);
          this.scrollProgress.set(l.limit > 0 ? l.scroll / l.limit : 0);
        });
        gsap.ticker.add((time) => this.lenis?.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
      } else {
        window.addEventListener(
          'scroll',
          () => {
            const limit = this.document.documentElement.scrollHeight - window.innerHeight;
            this.scrollY.set(window.scrollY);
            this.scrollProgress.set(limit > 0 ? window.scrollY / limit : 0);
          },
          { passive: true },
        );
      }

      AOS.init({
        duration: 900,
        easing: 'ease-out-cubic',
        once: true,
        offset: 60,
        disable: () => this.reduced(),
      });
    });

    // The router owns scroll position on navigation, not the browser.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    let lastPath = this.router.url.split(/[?#]/)[0];
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((event) => {
      const [url, hash] = event.urlAfterRedirects.split('#');
      const path = url.split('?')[0];
      const samePage = path === lastPath;
      lastPath = path;
      this.cancelFragment?.();
      this.zone.runOutsideAngular(() => {
        if (hash) {
          this.scrollToFragment(decodeURIComponent(hash), samePage);
        } else if (!samePage) {
          // New page: start at the top straight away, and again once it has painted.
          this.scrollTo(0, true);
          requestAnimationFrame(() => this.scrollTo(0, true));
        }
        setTimeout(() => this.refresh(), 450);
      });
    });
  }

  private cancelFragment?: () => void;

  /**
   * Scroll to the element with this id. Page content often renders after
   * NavigationEnd (lazy routes, API data), so wait for the element to appear,
   * then re-align once images and late content have settled the layout.
   */
  private scrollToFragment(id: string, samePage: boolean): void {
    const found = this.document.getElementById(id);
    if (found && samePage) {
      this.scrollTo(found);
      return;
    }

    this.scrollTo(0, true);
    let observer: MutationObserver | undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const stopUserScroll = () => this.cancelFragment?.();
    const cancel = () => {
      observer?.disconnect();
      timers.forEach(clearTimeout);
      window.removeEventListener('wheel', stopUserScroll);
      window.removeEventListener('touchstart', stopUserScroll);
      if (this.cancelFragment === cancel) this.cancelFragment = undefined;
    };
    this.cancelFragment = cancel;
    // The visitor taking over the scroll ends any pending re-alignment.
    window.addEventListener('wheel', stopUserScroll, { passive: true, once: true });
    window.addEventListener('touchstart', stopUserScroll, { passive: true, once: true });

    const land = () => {
      const target = this.document.getElementById(id);
      if (!target) return false;
      observer?.disconnect();
      requestAnimationFrame(() => {
        this.lenis?.resize();
        this.scrollTo(target, true);
      });
      // Images and async sections above the target can still push it down.
      timers.push(
        setTimeout(() => {
          this.lenis?.resize();
          this.scrollTo(target, true);
        }, 600),
        setTimeout(cancel, 1500),
      );
      return true;
    };

    if (land()) return;
    observer = new MutationObserver(() => land());
    observer.observe(this.document.body, { childList: true, subtree: true });
    timers.push(setTimeout(cancel, 5000));
  }

  /** Recalculate trigger positions after content changes (images, async data). */
  refresh(): void {
    if (!this.isBrowser) return;
    this.zone.runOutsideAngular(() => {
      this.lenis?.resize();
      ScrollTrigger.refresh();
      AOS.refresh();
    });
  }

  scrollTo(target: number | HTMLElement | string, immediate = false): void {
    if (!this.isBrowser) return;
    const offset = typeof target === 'number' ? 0 : -this.headerOffset();
    if (this.lenis) {
      // force: still scroll when an overlay (e.g. the mobile menu) has Lenis stopped mid-navigation.
      this.lenis.scrollTo(target, { immediate, offset, duration: 1.2, force: true });
      return;
    }
    const el = typeof target === 'string' ? this.document.querySelector<HTMLElement>(target) : target;
    const top = typeof el === 'number' ? el : el ? el.getBoundingClientRect().top + window.scrollY + offset : null;
    if (top !== null) window.scrollTo({ top, behavior: immediate ? 'auto' : 'smooth' });
  }

  /** Height of the fixed header + announcement bar, so targets aren't hidden under it. */
  private headerOffset(): number {
    const css = getComputedStyle(this.document.documentElement);
    const h = parseFloat(css.getPropertyValue('--header-h')) || 0;
    const a = parseFloat(css.getPropertyValue('--announce-h')) || 0;
    return h + a + 12;
  }

  /** Freeze page scroll while an overlay is open (nested-safe). */
  lockScroll(): void {
    if (!this.isBrowser) return;
    this.lockCount++;
    this.lenis?.stop();
    this.document.body.classList.add('no-scroll');
  }

  unlockScroll(): void {
    if (!this.isBrowser) return;
    this.lockCount = Math.max(0, this.lockCount - 1);
    if (this.lockCount === 0) {
      this.lenis?.start();
      this.document.body.classList.remove('no-scroll');
    }
  }
}
