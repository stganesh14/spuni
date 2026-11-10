import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Api } from '../../core/api/api.service';
import { GiftCard } from '../../core/api/models';
import { statusTone } from '../../core/utils/labels';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { InrPipe } from '../../shared/pipes/inr.pipe';

const LABEL: Record<GiftCard['status'], string> = {
  pending_payment: 'Awaiting payment',
  active: 'Delivered',
  redeemed: 'Redeemed',
  cancelled: 'Cancelled',
};

@Component({
  selector: 'app-account-gift-cards',
  imports: [RouterLink, DatePipe, InrPipe, EmptyState],
  template: `
    <section class="panel">
      <div class="row"><h2>Gift cards you've sent</h2><a class="btn btn-sm" routerLink="/gift"><i class="bi bi-plus"></i> Send one</a></div>
      @for (c of cards(); track c.id) {
        <article class="gc">
          <div class="mini-card"><span>SPUNI</span><b>{{ c.amount_paise | inr }}</b></div>
          <div class="meta">
            <b>To {{ c.recipient_name }}</b><small>{{ c.recipient_email }}</small>
            <small>Sent {{ c.created_at | date: 'd MMM y' }}@if (c.expires_at) { · valid till {{ c.expires_at | date: 'd MMM y' }} }</small>
          </div>
          <span class="status-pill" [class]="'status-pill ' + tone(c.status)">{{ label[c.status] }}</span>
        </article>
      } @empty {
        @if (loaded()) {
          <app-empty-state icon="bi-gift" title="No gift cards yet" text="Send a SPUNI e-gift card to someone you love. It arrives by email in minutes."
                           actionLink="/gift" actionLabel="Send a gift card" />
        }
      }
      <p class="muted note">Received a gift card? Redeem it from your <a routerLink="/account/wallet">wallet</a>.</p>
    </section>
  `,
  styles: `
    .panel { background: var(--paper); }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
    h2 { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: 1.4rem; }
    .gc { display: grid; grid-template-columns: 110px 1fr; gap: 14px; align-items: center; padding: 14px 0; border-top: 1px solid var(--line); }
    @media (min-width: 640px) { .gc { grid-template-columns: 110px 1fr auto; } }
    .mini-card { aspect-ratio: 1.6; border-radius: 10px; padding: 8px 10px; display: grid; align-content: space-between;
      color: var(--cream); background: radial-gradient(120% 120% at 0 0, #8a2a24, #3a1d14); font-size: .6rem; letter-spacing: .2em; }
    .mini-card b { font-size: .95rem; letter-spacing: 0; color: var(--gold-light); }
    .meta { display: grid; } .meta small { color: var(--muted); }
    .note { margin-top: 16px; font-size: .86rem; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountGiftCards {
  private readonly api = inject(Api);
  protected readonly label = LABEL;
  protected readonly tone = statusTone;
  protected readonly cards = signal<GiftCard[]>([]);
  protected readonly loaded = signal(false);

  constructor() {
    this.api.myGiftCards().subscribe({
      next: (c) => {
        this.cards.set(c);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }
}
