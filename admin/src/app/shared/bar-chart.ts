import { Component, computed, input, signal } from '@angular/core';

export interface BarDatum {
  label: string; // x label (e.g. date)
  value: number;
  display: string; // formatted value for tooltip
}

/**
 * Hand-rolled responsive SVG column chart (single series) with hover tooltip,
 * a recessive grid and an accessible table fallback.
 */
@Component({
  selector: 'app-bar-chart',
  template: `
    <figure class="chart">
      <figcaption class="visually-hidden">{{ caption() }}</figcaption>
      <div class="chart-plot" (mouseleave)="hover.set(null)">
        <div class="plot-area">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" [attr.aria-label]="caption()">
          @for (t of ticks(); track $index) {
            <line class="grid" [attr.x1]="0" [attr.x2]="W" [attr.y1]="t.y" [attr.y2]="t.y" />
          }
          @for (b of bars(); track b.i) {
            <rect
              class="bar"
              [class.active]="hover() === b.i"
              [attr.x]="b.x"
              [attr.y]="b.y"
              [attr.width]="b.w"
              [attr.height]="b.h"
              [attr.rx]="b.h > 4 ? 2 : 0"
              [style.fill]="color()"
            />
            <rect
              class="hit"
              [attr.x]="b.slot"
              y="0"
              [attr.width]="slotW()"
              [attr.height]="H"
              (mouseenter)="hover.set(b.i)"
              (touchstart)="hover.set(b.i)"
            />
          }
          <line class="axis" x1="0" [attr.x2]="W" [attr.y1]="H" [attr.y2]="H" />
        </svg>
        @if (hoverDatum(); as h) {
          <div class="tip" [style.left.%]="h.left" role="status">
            <strong>{{ h.d.display }}</strong>
            <span>{{ h.d.label }}</span>
          </div>
        }
        </div>
        <div class="y-labels" aria-hidden="true">
          @for (t of ticks(); track $index) {
            <span [style.top.%]="(t.y / H) * 100">{{ t.label }}</span>
          }
        </div>
      </div>
      <div class="x-labels" aria-hidden="true">
        <span>{{ first() }}</span>
        <span>{{ last() }}</span>
      </div>
      <details class="chart-table">
        <summary>View as table</summary>
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col" class="num">{{ valueLabel() }}</th>
            </tr>
          </thead>
          <tbody>
            @for (d of data(); track d.label) {
              <tr>
                <td>{{ d.label }}</td>
                <td class="num">{{ d.display }}</td>
              </tr>
            }
          </tbody>
        </table>
      </details>
    </figure>
  `,
  styles: `
    .chart { margin: 0; }
    .chart-plot { position: relative; height: 180px; padding-left: 44px; }
    .plot-area { position: relative; height: 100%; }
    svg { width: 100%; height: 100%; display: block; overflow: visible; }
    .grid { stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; stroke-dasharray: 2 3; }
    .axis { stroke: var(--parchment); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .bar { transition: opacity .15s ease; opacity: .88; }
    .bar.active { opacity: 1; }
    .hit { fill: transparent; cursor: default; }
    .y-labels { position: absolute; left: 0; top: 0; bottom: 0; width: 40px; }
    .y-labels span { position: absolute; right: 0; transform: translateY(-50%); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
    .x-labels { display: flex; justify-content: space-between; padding-left: 44px; margin-top: 6px; font-size: 11px; color: var(--muted); }
    .tip { position: absolute; top: -6px; transform: translate(-50%, -100%); background: var(--brown); color: var(--cream); padding: 6px 10px; border-radius: 8px; font-size: 12px; display: flex; flex-direction: column; align-items: center; pointer-events: none; white-space: nowrap; box-shadow: var(--shadow); }
    .tip span { color: var(--parchment); font-size: 11px; }
    .chart-table { margin-top: 10px; font-size: 12px; }
    .chart-table summary { cursor: pointer; color: var(--muted); }
    .chart-table table { margin-top: 8px; }
  `,
})
export class BarChart {
  readonly data = input.required<BarDatum[]>();
  readonly color = input('var(--burgundy)');
  readonly caption = input('');
  readonly valueLabel = input('Value');
  readonly tickFormat = input<(v: number) => string>((v) => String(v));
  protected readonly W = 600;
  protected readonly H = 180;
  protected readonly hover = signal<number | null>(null);

  private readonly max = computed(() => {
    const m = Math.max(0, ...this.data().map((d) => d.value));
    return niceMax(m);
  });
  protected readonly slotW = computed(() => this.W / Math.max(1, this.data().length));
  protected readonly bars = computed(() => {
    const n = this.data().length;
    const slot = this.slotW();
    const w = Math.max(2, slot - Math.min(6, slot * 0.3));
    const max = this.max();
    return this.data().map((d, i) => {
      const h = max ? (d.value / max) * (this.H - 4) : 0;
      return { i, slot: i * slot, x: i * slot + (slot - w) / 2, w, h: Math.max(d.value > 0 ? 2 : 0, h), y: this.H - Math.max(d.value > 0 ? 2 : 0, h), n };
    });
  });
  protected readonly ticks = computed(() => {
    const max = this.max();
    const f = this.tickFormat();
    return [0, 0.5, 1].map((p) => ({ y: this.H - p * this.H, label: f(max * p) }));
  });
  protected readonly hoverDatum = computed(() => {
    const i = this.hover();
    if (i === null) return null;
    const d = this.data()[i];
    if (!d) return null;
    return { d, left: ((i + 0.5) / this.data().length) * 100 };
  });
  protected readonly first = computed(() => this.data()[0]?.label ?? '');
  protected readonly last = computed(() => this.data().at(-1)?.label ?? '');
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}
