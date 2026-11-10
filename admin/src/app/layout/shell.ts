import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-shell',
  host: { '(document:keydown.escape)': 'navOpen.set(false)' },
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly navOpen = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly initials = computed(() => {
    const u = this.auth.user();
    const src = u?.full_name || u?.email || '?';
    return src
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]!.toUpperCase())
      .join('');
  });

  protected readonly groups: NavGroup[] = [
    { title: 'Overview', items: [{ path: '/', label: 'Dashboard', icon: '◫', exact: true }] },
    {
      title: 'Sales',
      items: [
        { path: '/orders', label: 'Orders', icon: '▤' },
        { path: '/customers', label: 'Customers', icon: '◍' },
        { path: '/gift-cards', label: 'Gift cards', icon: '✦' },
        { path: '/customizations', label: 'Customizations', icon: '✎' },
      ],
    },
    {
      title: 'Catalogue',
      items: [
        { path: '/products', label: 'Products', icon: '▣' },
        { path: '/categories', label: 'Categories', icon: '▦' },
        { path: '/launches', label: "What's new", icon: '✺' },
        { path: '/banners', label: 'Hero banners', icon: '▭' },
      ],
    },
    {
      title: 'Store',
      items: [
        { path: '/messages', label: 'Messages', icon: '✉' },
        { path: '/emails', label: 'Email log', icon: '⇄' },
        { path: '/settings', label: 'Settings', icon: '⚙' },
      ],
    },
  ];

  constructor() {
    // close the mobile drawer after navigating
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.navOpen.set(false));
  }

  protected async logout(): Promise<void> {
    this.signingOut.set(true);
    await this.auth.logout();
    this.signingOut.set(false);
  }
}
