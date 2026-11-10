import { Injectable, computed, signal } from '@angular/core';

/**
 * Loading state.
 * - `booting`: the full-screen intro loader shown on the first visit of a session.
 * - `isLoading`: reference-counted in-flight work that drives the slim top
 *   progress bar, so concurrent requests don't hide it early.
 */
@Injectable({ providedIn: 'root' })
export class Loader {
  private readonly activeRequests = signal(0);

  readonly isLoading = computed(() => this.activeRequests() > 0);
  readonly booting = signal(true);
  readonly message = signal<string>('');

  show(message = ''): void {
    if (message) this.message.set(message);
    this.activeRequests.update((v) => v + 1);
  }

  hide(): void {
    this.activeRequests.update((v) => Math.max(0, v - 1));
  }

  reset(): void {
    this.activeRequests.set(0);
    this.message.set('');
  }

  finishBoot(): void {
    this.booting.set(false);
  }
}
