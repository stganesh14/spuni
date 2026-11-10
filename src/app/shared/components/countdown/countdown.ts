import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';

/** Live flip-style countdown to a launch date. */
@Component({
  selector: 'app-countdown',
  template: `
    @if (parts(); as p) {
      <div class="cd" [class.compact]="compact()" role="timer" [attr.aria-label]="p.label">
        @for (unit of p.units; track unit.k) {
          <div class="unit">
            <span class="num">
              @for (d of unit.v; track $index) { <span class="digit">{{ d }}</span> }
            </span>
            <span class="k">{{ unit.k }}</span>
          </div>
        }
      </div>
    } @else {
      <span class="live">Live now</span>
    }
  `,
  styles: `
    .cd { display: inline-flex; gap: 10px; }
    .unit { display: grid; justify-items: center; gap: 4px; }
    .num { display: inline-flex; gap: 2px; }
    .digit { display: inline-grid; place-items: center; width: 1.25em; height: 1.6em; border-radius: 6px;
      background: var(--brown); color: var(--cream); font-family: var(--font-mono); font-size: 1.05rem;
      box-shadow: inset 0 -1px 0 rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08);
      animation: flip .5s var(--ease-out); }
    .k { font-family: var(--font-mono); font-size: .55rem; letter-spacing: .2em; text-transform: uppercase;
      color: var(--muted); }
    .compact .digit { font-size: .85rem; }
    .live { font-family: var(--font-mono); font-size: .7rem; letter-spacing: .2em; text-transform: uppercase;
      color: var(--burgundy); }
    @keyframes flip { from { transform: rotateX(-80deg); opacity: .4; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Countdown {
  readonly to = input<string | null>(null);
  readonly compact = input(false);
  private readonly now = signal(Date.now());

  protected readonly parts = computed(() => {
    const target = this.to() ? Date.parse(this.to() as string) : NaN;
    if (Number.isNaN(target)) return null;
    let diff = Math.max(0, Math.floor((target - this.now()) / 1000));
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86400);
    diff -= d * 86400;
    const h = Math.floor(diff / 3600);
    diff -= h * 3600;
    const m = Math.floor(diff / 60);
    const s = diff - m * 60;
    const pad = (n: number) => String(n).padStart(2, '0').split('');
    return {
      label: `${d} days ${h} hours ${m} minutes to launch`,
      units: [
        { k: 'days', v: pad(d) },
        { k: 'hrs', v: pad(h) },
        { k: 'min', v: pad(m) },
        { k: 'sec', v: pad(s) },
      ],
    };
  });

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timer = setInterval(() => this.now.set(Date.now()), 1000);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
  }
}
