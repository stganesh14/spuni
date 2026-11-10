import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Launch } from '../../../core/api/models';
import { Countdown } from '../../../shared/components/countdown/countdown';
import { NotifyMe } from '../../../shared/components/notify-me/notify-me';
import { RevealTextDirective } from '../../../shared/directives/reveal-text.directive';
import { TiltDirective } from '../../../shared/directives/tilt.directive';
import { ZoomableDirective } from '../../../shared/directives/zoomable.directive';

/** Upcoming drops from the admin "Launches" list, each with a Notify me button. */
@Component({
  selector: 'app-whats-new',
  imports: [RouterLink, DatePipe, Countdown, NotifyMe, RevealTextDirective, TiltDirective, ZoomableDirective],
  templateUrl: './whats-new.html',
  styleUrl: './whats-new.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsNew {
  readonly launches = input<Launch[]>([]);
  /** Home shows a teaser; the /whats-new page shows everything. */
  readonly full = input(false);

  protected readonly lead = computed(() => this.launches()[0] ?? null);
  protected readonly rest = computed(() => this.launches().slice(1, this.full() ? undefined : 3));

  protected shopLink(l: Launch): string[] {
    if (l.product_slug) return ['/product', l.product_slug];
    if (l.category) return ['/category', l.category.slug];
    return ['/shop'];
  }
}
