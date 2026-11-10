import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Api, apiErrorMessage } from '../../core/api/api.service';

@Component({
  selector: 'app-unsubscribe-page',
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="container narrow panel">
        @switch (state()) {
          @case ('working') { <p><span class="spin"></span> Updating your preferences…</p> }
          @case ('done') {
            <i class="bi bi-bell-slash"></i><h1 class="title">You're unsubscribed.</h1>
            <p>{{ message() }}</p><a class="btn" routerLink="/whats-new">See upcoming drops</a>
          }
          @default {
            <i class="bi bi-link-45deg"></i><h1 class="title">This link didn't work.</h1>
            <p>{{ message() }}</p><a class="btn" routerLink="/">Back to SPUNI</a>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .narrow { max-width: 620px; text-align: center; display: grid; justify-items: center; gap: 10px; background: var(--paper); }
    i { font-size: 2.4rem; color: var(--burgundy); } .title { margin: 0; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnsubscribePage {
  private readonly api = inject(Api);
  readonly token = input<string | undefined>();
  protected readonly state = signal<'working' | 'done' | 'error'>('working');
  protected readonly message = signal('');

  constructor() {
    effect(() => {
      const token = this.token();
      untracked(() => {
        if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
          this.state.set('error');
          this.message.set('The unsubscribe link is incomplete. Please use the link from your latest email.');
          return;
        }
        this.api.unsubscribe(token).subscribe({
          next: (res) => {
            this.state.set('done');
            this.message.set(res.message);
          },
          error: (err) => {
            this.state.set('error');
            this.message.set(apiErrorMessage(err, 'This link has expired.'));
          },
        });
      });
    });
  }
}
