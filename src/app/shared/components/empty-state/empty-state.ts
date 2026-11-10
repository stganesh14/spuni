import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-empty-state',
  imports: [RouterLink],
  template: `
    <div class="empty">
      <div class="art" aria-hidden="true"><i class="bi" [class]="'bi ' + icon()"></i></div>
      <h2>{{ title() }}</h2>
      @if (text()) { <p>{{ text() }}</p> }
      @if (actionLink()) { <a class="btn" [routerLink]="actionLink()">{{ actionLabel() }}</a> }
      <ng-content />
    </div>
  `,
  styles: `
    .empty { display: grid; justify-items: center; gap: 14px; text-align: center; padding: clamp(40px, 8vw, 90px) 16px; }
    .art { width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center; font-size: 2rem;
      border: 1px dashed var(--line-strong); color: var(--burgundy); animation: bob 4s ease-in-out infinite; }
    h2 { font-family: var(--font-display); font-weight: 400; font-size: clamp(1.6rem, 3vw, 2.2rem); }
    p { color: var(--muted); max-width: 42ch; }
    @keyframes bob { 50% { transform: translateY(-8px) rotate(-4deg); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly icon = input('bi-bag');
  readonly title = input('Nothing here yet');
  readonly text = input<string | null>(null);
  readonly actionLink = input<string | null>(null);
  readonly actionLabel = input('Explore the collection');
}
