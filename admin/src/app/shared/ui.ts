import { Component, computed, input, output } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { errorMessage } from '../core/validators';
import { humanize } from '../core/format';

/** Coloured pill for any status string. */
@Component({
  selector: 'app-status',
  template: `<span class="badge" [attr.data-tone]="tone()">{{ label() }}</span>`,
})
export class StatusBadge {
  readonly value = input.required<string>();
  readonly text = input<string | null>(null);
  protected readonly label = computed(() => this.text() ?? humanize(this.value()));
  protected readonly tone = computed(() => toneFor(this.value()));
}

export function toneFor(v: string): string {
  switch (v) {
    case 'confirmed':
    case 'active':
    case 'paid':
    case 'sent':
    case 'delivered':
    case 'launched':
    case 'completed':
    case 'accepted':
    case 'captured':
    case 'credit':
      return 'ok';
    case 'processing':
    case 'shipped':
    case 'out_for_delivery':
    case 'in_review':
    case 'in_progress':
    case 'quoted':
    case 'upcoming':
    case 'new':
    case 'sending':
      return 'info';
    case 'pending_payment':
    case 'pending':
    case 'created':
    case 'draft':
    case 'read':
    case 'low_stock':
      return 'warn';
    case 'cancelled':
    case 'refunded':
    case 'failed':
    case 'rejected':
    case 'expired':
    case 'inactive':
    case 'out_of_stock':
    case 'debit':
      return 'bad';
    default:
      return 'muted';
  }
}

/** Label + projected control + validation message. */
@Component({
  selector: 'app-field',
  template: `
    <div class="field" [class.invalid]="!!message()">
      @if (label()) {
        <label [attr.for]="for()">{{ label() }}@if (required()) {<span class="req" aria-hidden="true">*</span>}</label>
      }
      <ng-content />
      @if (message(); as m) {
        <p class="field-error" [id]="for() + '-error'" role="alert">{{ m }}</p>
      } @else if (hint()) {
        <p class="field-hint" [id]="for() + '-hint'">{{ hint() }}</p>
      }
    </div>
  `,
})
export class FieldComponent {
  readonly label = input<string>('');
  readonly for = input<string>('');
  readonly hint = input<string>('');
  readonly required = input(false);
  readonly control = input<AbstractControl | null>(null);
  protected message(): string | null {
    return errorMessage(this.control(), this.label() || 'This field');
  }
}

/** Loading / error / empty states for lists. */
@Component({
  selector: 'app-state',
  template: `
    @if (loading()) {
      <div class="state" role="status" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <span>Loading…</span>
      </div>
    } @else if (error()) {
      <div class="state state-error" role="alert">
        <p>{{ error() }}</p>
        <button type="button" class="btn btn-ghost" (click)="retry.emit()">Try again</button>
      </div>
    } @else if (empty()) {
      <div class="state state-empty">
        <p class="state-title">{{ emptyTitle() }}</p>
        @if (emptyText()) {
          <p>{{ emptyText() }}</p>
        }
        <ng-content />
      </div>
    }
  `,
})
export class StateComponent {
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly empty = input(false);
  readonly emptyTitle = input('Nothing here yet');
  readonly emptyText = input('');
  readonly retry = output<void>();
}

/** Prev / next pager for Page<T> responses. */
@Component({
  selector: 'app-pager',
  template: `
    @if (total() > 0) {
      <nav class="pager" aria-label="Pagination">
        <span class="pager-info">{{ from() }}–{{ to() }} of {{ total() }}</span>
        <button type="button" class="btn btn-ghost btn-sm" [disabled]="page() <= 1" (click)="go.emit(page() - 1)">
          ‹ Prev
        </button>
        <span class="pager-page" aria-current="page">Page {{ page() }} / {{ pages() }}</span>
        <button type="button" class="btn btn-ghost btn-sm" [disabled]="page() >= pages()" (click)="go.emit(page() + 1)">
          Next ›
        </button>
      </nav>
    }
  `,
})
export class PagerComponent {
  readonly page = input(1);
  readonly pages = input(1);
  readonly total = input(0);
  readonly pageSize = input(25);
  readonly go = output<number>();
  protected readonly from = computed(() => (this.page() - 1) * this.pageSize() + 1);
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
}

/** Page heading with optional actions slot. */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="page-header">
      <div>
        @if (eyebrow()) {
          <p class="eyebrow">{{ eyebrow() }}</p>
        }
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p class="subtitle">{{ subtitle() }}</p>
        }
      </div>
      <div class="page-actions"><ng-content /></div>
    </header>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly eyebrow = input('');
}
