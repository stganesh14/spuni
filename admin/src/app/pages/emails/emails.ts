import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api.service';
import { toApiError } from '../../core/errors';
import { EmailLog, EmailStatus, Page } from '../../core/models';
import { ToastService } from '../../core/ui.service';
import { DatePipe } from '../../shared/pipes';
import { PageHeader, PagerComponent, StateComponent, StatusBadge } from '../../shared/ui';

@Component({
  selector: 'app-emails',
  imports: [PageHeader, StateComponent, PagerComponent, StatusBadge, DatePipe],
  template: `
    <app-page-header title="Email log" eyebrow="Store" subtitle="Every transactional email the store has queued, with delivery status.">
      <button type="button" class="btn btn-ghost" [disabled]="loading()" (click)="load()">Refresh</button>
    </app-page-header>

    <div class="toolbar">
      <div class="tabs" role="group" aria-label="Status filter">
        @for (s of statuses; track s.value) {
          <button type="button" [attr.aria-pressed]="status() === s.value" (click)="setStatus(s.value)">{{ s.label }}</button>
        }
      </div>
    </div>

    <section class="card card-flush">
      <app-state
        [loading]="loading() && !result()"
        [error]="error()"
        [empty]="!!result() && result()!.items.length === 0"
        emptyTitle="No emails"
        (retry)="load()"
      />
      @if (result(); as r) {
        @if (r.items.length && !error()) {
          <div class="table-wrap" [style.opacity]="loading() ? 0.6 : 1">
            <table class="table responsive">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Template</th>
                  <th scope="col">Status</th>
                  <th scope="col" class="num">Attempts</th>
                  <th scope="col">Queued</th>
                  <th scope="col" class="actions"><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (e of r.items; track e.id) {
                  <tr>
                    <td class="primary-cell" data-label="">
                      <strong>{{ e.subject }}</strong>
                      <div class="muted small">{{ e.to_email }}</div>
                    </td>
                    <td data-label="Template" class="mono small">{{ e.template }}</td>
                    <td data-label="Status">
                      <app-status [value]="e.status" />
                      @if (e.last_error) {
                        <div class="danger-text small" [title]="e.last_error">{{ e.last_error.length > 80 ? e.last_error.slice(0, 80) + '…' : e.last_error }}</div>
                      }
                    </td>
                    <td class="num" data-label="Attempts">{{ e.attempts }}</td>
                    <td data-label="Queued" class="nowrap">
                      {{ e.created_at | dt: true }}
                      @if (e.sent_at) {
                        <div class="muted small">sent {{ e.sent_at | dt: true }}</div>
                      }
                    </td>
                    <td class="actions" data-label="">
                      @if (e.status === 'failed') {
                        <button type="button" class="btn btn-ghost btn-sm" [disabled]="retrying() === e.id" (click)="retry(e)">
                          {{ retrying() === e.id ? 'Retrying…' : 'Retry' }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-pager [page]="r.page" [pages]="r.pages" [total]="r.total" [pageSize]="r.page_size" (go)="goTo($event)" />
        }
      }
    </section>
  `,
})
export class EmailsPage {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  protected readonly statuses: { value: EmailStatus | ''; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'sending', label: 'Sending' },
    { value: 'sent', label: 'Sent' },
    { value: 'failed', label: 'Failed' },
  ];
  protected readonly status = signal<EmailStatus | ''>('');
  protected readonly page = signal(1);
  protected readonly result = signal<Page<EmailLog> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly retrying = signal<number | null>(null);

  constructor() {
    void this.load();
  }

  protected setStatus(s: EmailStatus | ''): void {
    this.status.set(s);
    this.page.set(1);
    void this.load();
  }
  protected goTo(p: number): void {
    this.page.set(p);
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.result.set(await firstValueFrom(this.api.emails({ status: this.status() || null, page: this.page(), page_size: 50 })));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async retry(e: EmailLog): Promise<void> {
    this.retrying.set(e.id);
    try {
      const updated = await firstValueFrom(this.api.retryEmail(e.id));
      this.result.update((r) => (r ? { ...r, items: r.items.map((x) => (x.id === e.id ? updated : x)) } : r));
      this.toast.success('Email queued to send again.');
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.retrying.set(null);
    }
  }
}
