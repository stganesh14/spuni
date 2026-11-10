import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(text: string, kind: ToastKind = 'info', ms = 4500): void {
    const id = ++this.seq;
    this.toasts.update((t) => [...t.slice(-3), { id, kind, text }]);
    if (ms > 0) setTimeout(() => this.dismiss(id), ms);
  }
  success(text: string): void {
    this.show(text, 'success');
  }
  error(text: string): void {
    this.show(text, 'error', 7000);
  }
  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<PendingConfirm | null>(null);

  ask(opts: ConfirmOptions): Promise<boolean> {
    this.current()?.resolve(false);
    return new Promise((resolve) => this.current.set({ ...opts, resolve }));
  }

  close(ok: boolean): void {
    const c = this.current();
    this.current.set(null);
    c?.resolve(ok);
  }
}
