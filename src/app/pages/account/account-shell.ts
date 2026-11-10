import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { StoreService } from '../../core/cart/store.service';
import { ToastService } from '../../core/ui/toast.service';
import { InrPipe } from '../../shared/pipes/inr.pipe';

@Component({
  selector: 'app-account-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, InrPipe],
  template: `
    <div class="page account">
      <div class="container">
        <header class="page-head head">
          <div>
            <span class="eyebrow">My account</span>
            <h1 class="title">Hello, <em>{{ auth.firstName() || 'there' }}.</em></h1>
          </div>
          <a class="wallet-card" routerLink="/account/wallet">
            <small>SPUNI Wallet</small>
            <b>{{ (store.walletBalance() ?? 0) | inr }}</b>
            <i class="bi bi-wallet2"></i>
          </a>
        </header>
        <div class="layout">
          <nav class="side" aria-label="Account">
            @for (l of links; track l.path) {
              <a [routerLink]="l.path" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: l.exact }">
                <i class="bi" [class]="'bi ' + l.icon"></i><span>{{ l.label }}</span></a>
            }
            <button type="button" (click)="logout()"><i class="bi bi-box-arrow-right"></i><span>Sign out</span></button>
          </nav>
          <section class="content"><router-outlet /></section>
        </div>
      </div>
    </div>
  `,
  styles: `
    .head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 18px; }
    .head .title { margin: 8px 0 0; }
    .wallet-card { position: relative; display: grid; min-width: 220px; padding: 18px 22px; border-radius: 18px;
      background: radial-gradient(120% 120% at 0 0, #8a2a24, #3a1d14); color: var(--cream); text-decoration: none;
      box-shadow: var(--shadow-soft); overflow: hidden; transition: transform .4s var(--ease-out); }
    .wallet-card:hover { transform: translateY(-4px) rotate(-1deg); }
    .wallet-card small { font-family: var(--font-mono); font-size: .58rem; letter-spacing: .22em; text-transform: uppercase; opacity: .8; }
    .wallet-card b { font-family: var(--font-display); font-weight: 400; font-size: 2rem; }
    .wallet-card i { position: absolute; right: 16px; top: 14px; font-size: 1.6rem; color: var(--gold-light); }
    .layout { display: grid; gap: 24px; align-items: start; }
    @media (min-width: 1024px) { .layout { grid-template-columns: 230px 1fr; } }
    .side { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 4px; }
    .side::-webkit-scrollbar { display: none; }
    @media (min-width: 1024px) { .side { flex-direction: column; position: sticky; top: calc(var(--header-h) + 20px); } }
    .side a, .side button { flex: none; display: flex; align-items: center; gap: 10px; padding: 11px 14px;
      border-radius: 12px; border: 0; background: none; color: var(--brown-soft); font: inherit; font-size: .9rem;
      text-decoration: none; cursor: pointer; white-space: nowrap; transition: background .25s, color .25s; }
    .side a:hover, .side button:hover { background: rgba(247,239,227,.6); }
    .side a.on { background: var(--brown); color: var(--cream); }
    .content { min-width: 0; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountShell {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(StoreService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly links = [
    { path: '/account', label: 'Overview', icon: 'bi-grid', exact: true },
    { path: '/account/orders', label: 'Orders', icon: 'bi-box-seam', exact: false },
    { path: '/account/wallet', label: 'Wallet', icon: 'bi-wallet2', exact: false },
    { path: '/account/addresses', label: 'Addresses', icon: 'bi-geo-alt', exact: false },
    { path: '/account/gift-cards', label: 'Gift cards', icon: 'bi-gift', exact: false },
    { path: '/account/customizations', label: 'Customisations', icon: 'bi-magic', exact: false },
    { path: '/account/profile', label: 'Profile', icon: 'bi-person', exact: false },
  ];

  constructor() {
    this.store.refreshWallet();
  }

  logout(): void {
    this.auth.logout().subscribe(() => {
      this.store.walletBalance.set(null);
      this.toast.show('You have been signed out.');
      this.router.navigateByUrl('/');
    });
  }
}
