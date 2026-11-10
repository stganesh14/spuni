import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { ConfirmService } from '../core/ui.service';

let modalSeq = 0;

/** Accessible modal built on the native <dialog> (focus trap + Esc handled by the browser). */
@Component({
  selector: 'app-modal',
  template: `
    <dialog
      #dlg
      class="modal"
      [class.modal-wide]="wide()"
      [attr.aria-labelledby]="titleId"
      (cancel)="$event.preventDefault(); closed.emit()"
      (click)="onBackdrop($event)"
    >
      <div class="modal-inner">
        <header class="modal-header">
          <h2 [id]="titleId">{{ title() }}</h2>
          <button type="button" class="icon-btn" aria-label="Close" (click)="closed.emit()">✕</button>
        </header>
        <div class="modal-body"><ng-content /></div>
        <footer class="modal-footer"><ng-content select="[modal-actions]" /></footer>
      </div>
    </dialog>
  `,
})
export class ModalComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly wide = input(false);
  readonly closed = output<void>();
  protected readonly titleId = `modal-title-${++modalSeq}`;
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.open() && !el.open) {
        if (typeof el.showModal === 'function') el.showModal();
        else el.setAttribute('open', '');
      } else if (!this.open() && el.open) {
        if (typeof el.close === 'function') el.close();
        else el.removeAttribute('open');
      }
    });
  }

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === this.dlg().nativeElement) this.closed.emit();
  }
}

/** Global confirm dialog driven by ConfirmService. */
@Component({
  selector: 'app-confirm-host',
  imports: [ModalComponent],
  template: `
    @let c = confirm.current();
    <app-modal [open]="!!c" [title]="c?.title ?? ''" (closed)="confirm.close(false)">
      <p class="confirm-message">{{ c?.message }}</p>
      <div modal-actions>
        <button type="button" class="btn btn-ghost" (click)="confirm.close(false)">{{ c?.cancelText ?? 'Cancel' }}</button>
        <button
          type="button"
          class="btn"
          [class.btn-danger]="c?.danger"
          [class.btn-primary]="!c?.danger"
          (click)="confirm.close(true)"
        >
          {{ c?.confirmText ?? 'Confirm' }}
        </button>
      </div>
    </app-modal>
  `,
})
export class ConfirmHost {
  constructor(protected readonly confirm: ConfirmService) {}
}
