import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Infinite ticker band. Pure CSS animation; pauses on hover. */
@Component({
  selector: 'app-marquee',
  template: `
    <div class="mq" [class.reverse]="reverse()" [class.dark]="tone() === 'dark'" [style.--speed]="speed() + 's'">
      @for (copy of copies; track copy) {
        <div class="track" [attr.aria-hidden]="copy > 0">
          @for (item of items(); track $index) {
            <span class="item">{{ item }}</span><span class="star" aria-hidden="true">✦</span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; overflow: hidden; }
    .mq { display: flex; width: max-content; padding: 18px 0; border-block: 1px solid var(--line-strong);
      background: var(--cream); color: var(--brown); }
    .mq.dark { background: var(--brown); color: var(--cream); border-color: transparent; }
    .track { display: flex; align-items: center; gap: 28px; padding-right: 28px;
      animation: scroll var(--speed, 30s) linear infinite; }
    .reverse .track { animation-direction: reverse; }
    .mq:hover .track { animation-play-state: paused; }
    .item { font-family: var(--font-display); font-style: italic; font-size: clamp(1.4rem, 3vw, 2.4rem);
      white-space: nowrap; }
    .item:nth-child(4n+1) { font-style: normal; font-family: var(--font-mono); font-size: clamp(.8rem,1.4vw,1rem);
      letter-spacing: .24em; text-transform: uppercase; }
    .star { color: var(--burgundy); font-size: 1.1rem; }
    .dark .star { color: var(--gold-light); }
    @keyframes scroll { to { transform: translateX(-100%); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Marquee {
  readonly items = input<string[]>([]);
  readonly reverse = input(false);
  readonly speed = input(36);
  readonly tone = input<'light' | 'dark'>('light');
  protected readonly copies = [0, 1];
  protected readonly count = computed(() => this.items().length);
}
