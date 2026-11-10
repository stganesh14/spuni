import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { StoreService } from '../../../core/cart/store.service';
import { MotionService } from '../../../core/motion/motion.service';

const FALLBACK_EMAIL = 'spunileathers@gmail.com';
const FALLBACK_PHONE = '+91 91769 69556';

@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Footer {
  private readonly store = inject(StoreService);
  private readonly motion = inject(MotionService);
  private readonly root = viewChild<ElementRef<HTMLElement>>('root');

  protected readonly year = new Date().getFullYear();
  protected readonly categories = computed(() => this.store.menu()?.categories ?? []);
  protected readonly email = computed(() => this.store.info()?.support_email || FALLBACK_EMAIL);
  protected readonly phone = computed(() => this.store.info()?.support_phone || FALLBACK_PHONE);
  protected readonly phoneHref = computed(() => this.phone().replace(/[^\d+]/g, ''));
  protected readonly whatsapp = computed(() => `https://wa.me/${this.phoneHref().replace(/\D/g, '')}`);
  protected readonly letters = 'SPUNI'.split('');

  constructor() {
    this.store.loadMenu().subscribe();
    this.store.loadInfo().subscribe();

    afterNextRender(() => {
      const root = this.root()?.nativeElement;
      if (!root || this.motion.reduced()) return;
      const ctx = gsap.context(() => {
        gsap.from('.word span', {
          yPercent: 110,
          rotate: 6,
          stagger: 0.07,
          duration: 1.1,
          ease: 'expo.out',
          scrollTrigger: { trigger: '.word', start: 'top 92%' },
        });
        gsap.from('.col', {
          y: 30,
          autoAlpha: 0,
          stagger: 0.08,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: root, start: 'top 85%' },
        });
      }, root);
      // Content above the footer changes height as pages load.
      setTimeout(() => ScrollTrigger.refresh(), 800);
      return () => ctx.revert();
    });
  }

  toTop(): void {
    this.motion.scrollTo(0);
  }
}
