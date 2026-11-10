import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
  action?: { label: string; link: string };
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  show(message: string, tone: Toast['tone'] = 'info', action?: Toast['action'], ms = 4200): void {
    const toast: Toast = { id: this.nextId++, message, tone, action };
    this.toasts.update((list) => [...list.slice(-2), toast]);
    setTimeout(() => this.dismiss(toast.id), ms);
  }

  success(message: string, action?: Toast['action']): void {
    this.show(message, 'success', action);
  }

  error(message: string): void {
    this.show(message, 'error', undefined, 6000);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
