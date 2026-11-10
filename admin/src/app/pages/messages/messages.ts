import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { toApiError } from '../../core/errors';
import { ContactMessage, ContactStatus } from '../../core/models';
import { ToastService } from '../../core/ui.service';
import { DatePipe } from '../../shared/pipes';
import { PageHeader, StateComponent, StatusBadge } from '../../shared/ui';

@Component({
  selector: 'app-messages',
  imports: [PageHeader, StateComponent, StatusBadge, DatePipe],
  template: `
    <app-page-header title="Messages" eyebrow="Store" subtitle="Enquiries sent through the contact form." />

    <div class="toolbar">
      <div class="tabs" role="group" aria-label="Status filter">
        @for (s of statuses; track s.value) {
          <button type="button" [attr.aria-pressed]="status() === s.value" (click)="setStatus(s.value)">{{ s.label }}</button>
        }
      </div>
    </div>

    <app-state
      [loading]="loading() && !items()"
      [error]="error()"
      [empty]="!!items() && items()!.length === 0"
      emptyTitle="No messages"
      emptyText="You're all caught up."
      (retry)="load()"
    />

    @if (items(); as list) {
      @if (list.length && !error()) {
        <div class="stack" [style.opacity]="loading() ? 0.6 : 1">
          @for (m of list; track m.id) {
            <article class="card message" [class.unread]="m.status === 'new'">
              <header class="card-header">
                <div>
                  <h2>{{ m.subject }}</h2>
                  <p class="muted small" style="margin: 0">
                    {{ m.name }} · <a [href]="'mailto:' + m.email + '?subject=' + encode('Re: ' + m.subject)">{{ m.email }}</a>
                    @if (m.phone) {
                      · <a [href]="'tel:' + m.phone">{{ m.phone }}</a>
                    }
                    · {{ m.created_at | dt: true }}
                  </p>
                </div>
                <app-status [value]="m.status" [text]="m.status === 'new' ? 'Unread' : null" />
              </header>
              <p class="message-body">{{ m.message }}</p>
              <footer class="form-actions" style="justify-content: flex-start; margin-top: 14px">
                @if (m.status === 'new') {
                  <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy() === m.id" (click)="set(m, 'read')">Mark as read</button>
                }
                @if (m.status !== 'closed') {
                  <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy() === m.id" (click)="set(m, 'closed')">Close</button>
                } @else {
                  <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy() === m.id" (click)="set(m, 'read')">Reopen</button>
                }
                <a class="btn btn-primary btn-sm" [href]="'mailto:' + m.email + '?subject=' + encode('Re: ' + m.subject)">Reply by email</a>
              </footer>
            </article>
          }
        </div>
      }
    }
  `,
  styles: `
    .message.unread { border-left: 3px solid var(--burgundy); }
    .message h2 { margin: 0 0 2px; }
  `,
})
export class MessagesPage {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  protected readonly statuses: { value: ContactStatus | ''; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'new', label: 'Unread' },
    { value: 'read', label: 'Read' },
    { value: 'closed', label: 'Closed' },
  ];
  protected readonly status = signal<ContactStatus | ''>('');
  protected readonly items = signal<ContactMessage[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal<number | null>(null);
  protected readonly encode = encodeURIComponent;

  constructor() {
    void this.load();
  }

  protected setStatus(s: ContactStatus | ''): void {
    this.status.set(s);
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set(await firstValueFrom(this.api.messages(this.status() || undefined)));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async set(m: ContactMessage, status: ContactStatus): Promise<void> {
    this.busy.set(m.id);
    try {
      const updated = await firstValueFrom(this.api.setMessageStatus(m.id, status));
      const filter = this.status();
      this.items.update((list) =>
        (list ?? [])
          .map((x) => (x.id === m.id ? updated : x))
          .filter((x) => !filter || x.status === filter),
      );
      this.toast.success(status === 'closed' ? 'Message closed.' : 'Message marked as read.');
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.busy.set(null);
    }
  }
}
