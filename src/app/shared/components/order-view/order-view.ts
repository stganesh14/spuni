import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Order } from '../../../core/api/models';
import { ORDER_STATUS_LABEL, ORDER_STEPS, statusTone } from '../../../core/utils/labels';
import { InrPipe } from '../../pipes/inr.pipe';

/** Order details: progress timeline, items, totals, delivery and tracking. */
@Component({
  selector: 'app-order-view',
  imports: [RouterLink, DatePipe, InrPipe],
  templateUrl: './order-view.html',
  styleUrl: './order-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderView {
  readonly order = input.required<Order>();
  readonly busy = input(false);
  readonly cancel = output<string | null>();
  readonly pay = output<void>();

  protected readonly confirmCancel = signal(false);
  protected cancelReason = '';
  protected readonly labels = ORDER_STATUS_LABEL;
  protected readonly steps = ORDER_STEPS;
  protected readonly tone = computed(() => statusTone(this.order().status));
  protected readonly stepIndex = computed(() => this.steps.indexOf(this.order().status));
  protected readonly ended = computed(() => ['cancelled', 'refunded', 'expired'].includes(this.order().status));
  protected readonly eventsNewestFirst = computed(() => [...this.order().events].reverse());

  protected label(status: string): string {
    return (this.labels as Record<string, string>)[status] ?? status.replace(/_/g, ' ');
  }

  submitCancel(): void {
    this.cancel.emit(this.cancelReason.trim().slice(0, 300) || null);
    this.confirmCancel.set(false);
  }
}
