import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Api, apiErrorMessage } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/ui/toast.service';
import { safeStorage } from '../../../core/utils/storage';

const KEY = 'spuni.notify.v1';

/** "Notify me" for an upcoming launch: one tap when signed in, email otherwise. */
@Component({
  selector: 'app-notify-me',
  imports: [FormsModule],
  template: `
    @if (done()) {
      <div class="done" role="status"><i class="bi bi-bell-fill"></i> {{ doneText() }}</div>
    } @else if (asking()) {
      <form class="ask" (ngSubmit)="submit()" novalidate>
        <label class="sr-only" [attr.for]="'notify-' + slug()">Your email</label>
        <input [id]="'notify-' + slug()" class="input" type="email" name="email" [(ngModel)]="email" required
               autocomplete="email" placeholder="you@email.com" maxlength="254" />
        <button class="btn btn-primary btn-sm" type="submit" [disabled]="busy()">
          @if (busy()) { <span class="spin"></span> } @else { Notify me }
        </button>
        @if (error()) { <p class="err">{{ error() }}</p> }
      </form>
    } @else {
      <button type="button" class="btn" [class.btn-light]="tone() === 'light'" (click)="start()" [disabled]="busy()">
        <i class="bi bi-bell"></i> {{ busy() ? 'Saving…' : 'Notify me' }}
      </button>
    }
  `,
  styles: `
    :host { display: block; }
    .ask { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .ask .input { flex: 1 1 200px; min-height: 44px; border-radius: 999px; }
    .err { width: 100%; font-size: .8rem; color: var(--danger); }
    .done { display: inline-flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: 999px;
      background: rgba(63,107,58,.14); color: var(--success); font-size: .82rem; font-weight: 600;
      animation: pop .5s var(--ease-out); }
    @keyframes pop { from { transform: scale(.9); opacity: 0; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotifyMe implements OnInit {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly slug = input.required<string>();
  readonly title = input('');
  readonly tone = input<'dark' | 'light'>('dark');

  protected email = '';
  protected readonly asking = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly doneText = signal("You're on the list");
  protected readonly done = signal(false);

  ngOnInit(): void {
    const subscribed = safeStorage.get<string[]>(KEY, []);
    if (subscribed.includes(this.slug())) this.done.set(true);
  }

  start(): void {
    if (this.auth.isLoggedIn()) {
      this.send(null);
    } else {
      this.asking.set(true);
    }
  }

  submit(): void {
    const email = this.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      this.error.set('Enter a valid email address.');
      return;
    }
    this.send(email);
  }

  private send(email: string | null): void {
    this.busy.set(true);
    this.error.set('');
    this.api.notifyLaunch(this.slug(), email).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.done.set(true);
        this.asking.set(false);
        this.doneText.set(res.message.startsWith("You're already") ? 'Already on the list' : "You're on the list");
        safeStorage.set(KEY, [...safeStorage.get<string[]>(KEY, []), this.slug()].slice(-50));
        this.toast.success(res.message);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
        if (!this.asking()) this.toast.error(apiErrorMessage(err));
      },
    });
  }
}
