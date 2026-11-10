import { Component, inject } from '@angular/core';
import { ToastService } from '../core/ui.service';

@Component({
  selector: 'app-toast-host',
  template: `
    <div class="toasts" aria-live="polite" aria-atomic="false">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [attr.data-kind]="t.kind" [attr.role]="t.kind === 'error' ? 'alert' : 'status'">
          <span class="toast-icon" aria-hidden="true">{{ t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : 'i' }}</span>
          <span class="toast-text">{{ t.text }}</span>
          <button type="button" class="icon-btn" aria-label="Dismiss" (click)="toast.dismiss(t.id)">✕</button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly toast = inject(ToastService);
}
