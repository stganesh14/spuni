import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';

/** Six single-digit boxes with auto-advance, backspace, arrow keys and paste. */
@Component({
  selector: 'app-otp-input',
  template: `
    <div class="otp" [class.error]="invalid()" role="group" aria-label="6-digit code">
      @for (i of slots; track i) {
        <input
          #box
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="1"
          [value]="digits()[i]"
          [attr.aria-label]="'Digit ' + (i + 1)"
          [disabled]="disabled()"
          (input)="onInput(i, $event)"
          (keydown)="onKey(i, $event)"
          (paste)="onPaste($event)"
          (focus)="select($event)"
        />
      }
    </div>
  `,
  styles: `
    .otp { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: clamp(6px, 2vw, 12px); }
    input { width: 100%; aspect-ratio: 4/5; max-height: 74px; text-align: center; border-radius: 14px;
      border: 1px solid var(--line-strong); background: var(--paper); font-family: var(--font-mono);
      font-size: clamp(1.4rem, 5vw, 2rem); color: var(--brown); transition: border-color .2s, transform .25s, box-shadow .2s; }
    input:focus { outline: none; border-color: var(--burgundy); box-shadow: 0 0 0 4px rgba(100,31,31,.14);
      transform: translateY(-3px); }
    .error input { border-color: var(--danger); animation: shake .4s; }
    @keyframes shake { 20%,60% { transform: translateX(-5px); } 40%,80% { transform: translateX(5px); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OtpInput {
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly autofocus = input(true);
  readonly completed = output<string>();
  readonly changed = output<string>();

  protected readonly slots = [0, 1, 2, 3, 4, 5];
  protected readonly digits = signal<string[]>(['', '', '', '', '', '']);
  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');

  constructor() {
    afterNextRender(() => {
      if (this.autofocus()) this.focus(0);
    });
  }

  clear(): void {
    this.digits.set(['', '', '', '', '', '']);
    this.focus(0);
  }

  protected select(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }

  protected onInput(index: number, event: Event): void {
    const el = event.target as HTMLInputElement;
    const value = el.value.replace(/\D/g, '');
    if (value.length > 1) {
      this.fill(value, index);
      return;
    }
    this.set(index, value);
    el.value = value;
    if (value && index < 5) this.focus(index + 1);
  }

  protected onKey(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      this.set(index - 1, '');
      this.focus(index - 1);
      event.preventDefault();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      this.focus(index - 1);
    } else if (event.key === 'ArrowRight' && index < 5) {
      this.focus(index + 1);
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const digits = text.replace(/\D/g, '');
    if (!digits) return;
    event.preventDefault();
    this.fill(digits, 0);
  }

  private fill(value: string, start: number): void {
    const next = [...this.digits()];
    for (let i = 0; i < value.length && start + i < 6; i++) next[start + i] = value[i];
    this.digits.set(next);
    this.emit();
    this.focus(Math.min(5, start + value.length));
  }

  private set(index: number, value: string): void {
    const next = [...this.digits()];
    next[index] = value;
    this.digits.set(next);
    this.emit();
  }

  private emit(): void {
    const code = this.digits().join('');
    this.changed.emit(code);
    if (code.length === 6) this.completed.emit(code);
  }

  private focus(index: number): void {
    this.boxes()[index]?.nativeElement.focus();
  }
}
