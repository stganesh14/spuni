import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ToastService } from '../../../core/ui/toast.service';

@Component({
  selector: 'app-toast-host',
  imports: [RouterLink],
  template: `
    <div class="toasts" aria-live="polite" aria-atomic="false">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="'toast ' + t.tone" role="status">
          <i class="bi" [class.bi-check2-circle]="t.tone === 'success'" [class.bi-exclamation-circle]="t.tone === 'error'"
             [class.bi-info-circle]="t.tone === 'info'"></i>
          <span>{{ t.message }}</span>
          @if (t.action) {
            <a [routerLink]="t.action.link" (click)="toast.dismiss(t.id)">{{ t.action.label }}</a>
          }
          <button type="button" (click)="toast.dismiss(t.id)" aria-label="Dismiss"><i class="bi bi-x"></i></button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed; left: 50%; bottom: max(20px, env(safe-area-inset-bottom)); z-index: 6000;
      transform: translateX(-50%); display: grid; gap: 10px; width: min(460px, calc(100% - 32px));
      pointer-events: none;
    }
    .toast {
      pointer-events: auto; display: flex; align-items: center; gap: 12px; padding: 14px 16px;
      border-radius: 14px; background: var(--brown); color: var(--cream); font-size: 0.88rem;
      box-shadow: 0 20px 50px -20px rgba(0,0,0,.6); animation: toast-in .5s var(--ease-out);
      border: 1px solid rgba(238,227,210,.12);
    }
    .toast.success i:first-child { color: #b8d39b; }
    .toast.error { background: #5a1c17; }
    .toast span { flex: 1; }
    .toast a { font-size: .7rem; font-weight: 600; letter-spacing: .16em; text-transform: uppercase;
      border-bottom: 1px solid currentColor; }
    .toast button { color: inherit; opacity: .7; font-size: 1.1rem; }
    @keyframes toast-in { from { opacity: 0; transform: translateY(20px) scale(.96); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHost {
  protected readonly toast = inject(ToastService);
}
