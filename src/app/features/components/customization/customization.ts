import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, afterNextRender, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { gsap } from 'gsap';

import { MotionService } from '../../../core/motion/motion.service';
import { MagneticDirective } from '../../../shared/directives/magnetic.directive';
import { RevealTextDirective } from '../../../shared/directives/reveal-text.directive';
import { ZoomableDirective } from '../../../shared/directives/zoomable.directive';

export interface CustomizationWay {
  mode: 'catalog' | 'upload' | 'expert';
  step: string;
  title: string;
  text: string;
  image: string;
  alt: string;
  points: string[];
  cta: string;
}

export const CUSTOMIZATION_WAYS: CustomizationWay[] = [
  {
    mode: 'catalog',
    step: '01',
    title: 'Pick a piece you love',
    text: 'Choose any customisable SPUNI piece and make it yours with initials, colours or hardware.',
    image: '/assets/customization-finished.png',
    alt: 'A finished, personalised SPUNI leather piece',
    points: ['Monogram or hot-stamped initials', 'Thread and edge colours', 'Brass, gunmetal or gold hardware'],
    cta: 'Personalise a piece',
  },
  {
    mode: 'upload',
    step: '02',
    title: 'Upload your idea',
    text: 'Share a sketch, a reference photo or a few lines of text. We turn it into a one-of-one design.',
    image: '/assets/customization-sketch.png',
    alt: 'A hand-drawn sketch for a custom leather bag',
    points: ['Up to 5 photos or sketches', 'Your own text or artwork', 'A quote within 48 hours'],
    cta: 'Upload a reference',
  },
  {
    mode: 'expert',
    step: '03',
    title: 'Talk to an expert',
    text: 'Book a call with our master craftsperson for corporate gifts, weddings or something truly bespoke.',
    image: '/assets/craftsmanship.jpeg',
    alt: 'A SPUNI craftsperson stitching leather by hand',
    points: ['Call, WhatsApp or email', 'Bulk and corporate orders', 'Material and fit guidance'],
    cta: 'Book an expert',
  },
];

/** Three ways to customise, side by side, rising in one after another as you scroll. */
@Component({
  selector: 'app-customization',
  imports: [RouterLink, MagneticDirective, RevealTextDirective, ZoomableDirective],
  templateUrl: './customization.html',
  styleUrl: './customization.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Customization {
  private readonly motion = inject(MotionService);
  private readonly zone = inject(NgZone);
  private readonly deck = viewChild<ElementRef<HTMLElement>>('deck');
  protected readonly ways = CUSTOMIZATION_WAYS;

  constructor() {
    let ctx: gsap.Context | undefined;
    inject(DestroyRef).onDestroy(() => ctx?.revert());
    afterNextRender(() => {
      const deck = this.deck()?.nativeElement;
      if (!deck || this.motion.reduced()) return;
      this.zone.runOutsideAngular(() => {
        // Cards rise into their own grid cells; they never move sideways, so they can't overlap.
        ctx = gsap.context(() => {
          gsap.from('.way', {
            y: 60,
            autoAlpha: 0,
            duration: 1,
            ease: 'expo.out',
            stagger: 0.15,
            clearProps: 'transform,opacity,visibility',
            scrollTrigger: { trigger: deck, start: 'top 85%', once: true },
          });
        }, deck);
      });
    });
  }
}
