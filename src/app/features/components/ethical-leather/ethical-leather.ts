import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  inject
} from '@angular/core';

import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

type Select = (selector: string) => Element[];


@Component({
  selector: 'app-ethical-leather',
  imports: [RouterLink],
  templateUrl: './ethical-leather.html',
  styleUrl: './ethical-leather.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EthicalLeather implements AfterViewInit, OnDestroy {

  private readonly platformId = inject(PLATFORM_ID);
  private readonly ngZone = inject(NgZone);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private mm?: gsap.MatchMedia;
  private resizeObserver?: ResizeObserver;
  private refreshTimer?: number;


  processItems = [
    {
      number: '01',
      title: 'SOURCED',
      description:
        'We carefully consider the origin and quality of every material used in our products.',
      image: '/assets/source.jpeg'
    },
    {
      number: '02',
      title: 'REFINED',
      description:
        'Materials are refined with attention to quality, texture and long-term performance.',
      image: '/assets/refined.jpeg'
    },
    {
      number: '03',
      title: 'CRAFTED',
      description:
        'Skilled craftsmanship brings every material together with thoughtful design.',
      image: '/assets/crafted.jpeg'
    },
    {
      number: '04',
      title: 'CARRIED',
      description:
        'The finished piece is designed to become something you can carry and keep for years.',
      image: '/assets/carried.jpeg'
    }
  ];


  ngAfterViewInit(): void {

    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.ngZone.runOutsideAngular(() => this.init());
  }


  private init(): void {

    gsap.registerPlugin(ScrollTrigger);

    const root = this.host.nativeElement;
    const q = gsap.utils.selector(root) as Select;
    const one = (selector: string) => root.querySelector(selector)!;

    /*
     * Nothing is hidden by CSS. Every starting state is applied by
     * GSAP in the browser only, so SSR, failed JS and reduced motion
     * always show the content. The callback runs only when the user
     * has not asked for reduced motion; desktop toggles layout-specific
     * moves and the parallax.
     */
    this.mm = gsap.matchMedia(root);

    this.mm.add(
      {
        motion: '(prefers-reduced-motion: no-preference)',
        desktop: '(min-width: 992px)'
      },
      (ctx) => {

        const desktop = !!ctx.conditions?.['desktop'];

        this.animateStory(q, one);
        this.animateCraftImage(q, one, desktop);
        this.animateProcess(q, one);
        this.animateBottomMaterial(q, one, desktop);
        this.animateFinalMessage(q, one);

        if (desktop) {
          this.initParallax(q);
        }
      }
    );

    this.watchLayout();
  }


  /* =========================================
     SHARED REVEAL TIMELINE

     - Starts only when the element nears the viewport.
     - clamp(): if the start point can't be reached (the last
       block on the page can't scroll any higher), it is pulled
       back to the maximum scroll so it still fires.
     - onLeave: scrolled past before it finished? Jump to the
       end state (it's off-screen anyway).
     - fastScrollEnd: same idea while scrolling very fast.
  ========================================= */

  private reveal(trigger: Element, start: string): gsap.core.Timeline {

    return gsap.timeline({
      defaults: { ease: 'power3.out' },
      scrollTrigger: {
        trigger,
        start: `clamp(${start})`,
        fastScrollEnd: true,
        onLeave: (self) => self.animation?.progress(1)
      }
    });
  }


  /* =========================================
     STORY
  ========================================= */

  private animateStory(q: Select, one: (s: string) => Element): void {

    this.reveal(one('.story-content'), 'top 80%')
      .from(q('.story-label'), { autoAlpha: 0, y: 20, duration: 0.7 })
      .from(q('.story-title'), { autoAlpha: 0, y: 45, duration: 1 }, '-=0.35')
      .from(q('.story-copy'), { autoAlpha: 0, y: 25, duration: 0.8, ease: 'power2.out' }, '-=0.5')
      .from(
        q('.story-button'),
        {
          autoAlpha: 0,
          y: 20,
          duration: 0.7,
          ease: 'power2.out',
          // hand the transform back to the CSS hover lift
          clearProps: 'transform,opacity,visibility'
        },
        '-=0.4'
      );
  }


  /* =========================================
     CRAFT IMAGE
  ========================================= */

  private animateCraftImage(
    q: Select,
    one: (s: string) => Element,
    desktop: boolean
  ): void {

    this.reveal(one('.craft-image-container'), 'top 82%')
      .from(q('.craft-image-container'), {
        autoAlpha: 0,
        x: desktop ? 70 : 0,
        y: desktop ? 0 : 40,
        scale: 0.94,
        duration: 1.1
      })
      .from(q('.craft-image'), { scale: 1.16, duration: 1.5, ease: 'power2.out' }, '-=0.85')
      .from(q('.craft-image-text'), { autoAlpha: 0, y: 12, duration: 0.8, ease: 'power2.out' }, '-=0.7');
  }


  /* =========================================
     PROCESS

     Cards reveal in batches as they enter, so on a phone (one
     card per screen) each card animates when you reach it, and on
     desktop the row staggers together.
  ========================================= */

  private animateProcess(q: Select, one: (s: string) => Element): void {

    this.reveal(one('.process-heading'), 'top 85%')
      .from(q('.process-heading'), { autoAlpha: 0, y: 35, duration: 0.8 });

    const cards = q('.process-card');
    const images = (batch: Element[]) =>
      batch
        .map((card) => card.querySelector('.process-image'))
        .filter((img): img is Element => !!img);

    gsap.set(cards, { autoAlpha: 0, y: 45 });
    gsap.set(images(cards), { scale: 1.14 });

    ScrollTrigger.batch(cards, {
      start: 'clamp(top 88%)',
      onEnter: (batch) => {
        gsap.to(batch, {
          autoAlpha: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.12,
          ease: 'power3.out'
        });
        gsap.to(images(batch), {
          scale: 1,
          duration: 1.2,
          stagger: 0.12,
          ease: 'power2.out'
        });
      },
      // scrolled past: land on the final state immediately
      onLeave: (batch) => {
        gsap.set(batch, { autoAlpha: 1, y: 0, overwrite: true });
        gsap.set(images(batch), { scale: 1, overwrite: true });
      }
    });
  }


  /* =========================================
     BOTTOM MATERIAL
  ========================================= */

  private animateBottomMaterial(
    q: Select,
    one: (s: string) => Element,
    desktop: boolean
  ): void {

    this.reveal(one('.bottom-material-image'), 'top 85%')
      .from(q('.bottom-material-image'), {
        autoAlpha: 0,
        x: desktop ? -60 : 0,
        y: desktop ? 0 : 40,
        duration: 1
      });

    this.reveal(one('.bottom-material-content'), 'top 80%')
      .from(
        q('.bottom-material-content'),
        {
          autoAlpha: 0,
          x: desktop ? 50 : 0,
          y: desktop ? 0 : 40,
          duration: 1
        },
        desktop ? 0.25 : 0
      )
      .from(
        q('.bottom-material-badge'),
        { autoAlpha: 0, y: 20, duration: 0.6, ease: 'power2.out' },
        '-=0.65'
      );
  }


  /* =========================================
     FINAL MESSAGE
  ========================================= */

  private animateFinalMessage(q: Select, one: (s: string) => Element): void {

    this.reveal(one('.final-message'), 'top 80%')
      .from(q('.final-message h2'), { autoAlpha: 0, y: 45, duration: 1 })
      .from(q('.final-message p'), { autoAlpha: 0, y: 25, duration: 0.8, ease: 'power2.out' }, '-=0.55');
  }


  /* =========================================
     DESKTOP PARALLAX
     Triggers on the image's wrapper, not the image itself: a
     scrubbed trigger that moves as it animates jitters.
  ========================================= */

  private initParallax(q: Select): void {

    q('[data-parallax]').forEach((element) => {

      gsap.to(element, {
        yPercent: -7,
        ease: 'none',
        scrollTrigger: {
          trigger: element.parentElement!,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true
        }
      });
    });
  }


  /* =========================================
     LAYOUT WATCH
     This is the last block on the home page, so every lazy image
     or font that loads above it moves it further down. Trigger
     positions measured earlier go stale, which is what left the
     content hidden until much later. Re-measure when it changes.
  ========================================= */

  private watchLayout(): void {

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(
        () => ScrollTrigger.refresh(),
        200
      );
    });

    this.resizeObserver.observe(document.body);
  }


  /* =========================================
     CLEANUP
     Reverts only this component's animations. The old version
     killed every ScrollTrigger on the page, including other
     components'.
  ========================================= */

  ngOnDestroy(): void {

    clearTimeout(this.refreshTimer);
    this.resizeObserver?.disconnect();
    this.mm?.revert();
  }
}