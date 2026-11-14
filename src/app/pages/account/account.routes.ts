import { Routes } from '@angular/router';

export const accountRoutes: Routes = [
  { path: '', loadComponent: () => import('./overview').then((m) => m.AccountOverview), title: 'My account · SPUNI' },
  { path: 'orders', loadComponent: () => import('./orders').then((m) => m.AccountOrders), title: 'My orders · SPUNI' },
  { path: 'orders/:number', loadComponent: () => import('./order-detail').then((m) => m.AccountOrderDetail), title: 'Order · SPUNI' },
  { path: 'wallet', loadComponent: () => import('./wallet').then((m) => m.AccountWallet), title: 'Spuni Cash' },
  { path: 'addresses', loadComponent: () => import('./addresses').then((m) => m.AccountAddresses), title: 'Addresses · SPUNI' },
  { path: 'gift-cards', loadComponent: () => import('./gift-cards').then((m) => m.AccountGiftCards), title: 'Gift cards · SPUNI' },
  {
    path: 'customizations',
    loadComponent: () => import('./customizations').then((m) => m.AccountCustomizations),
    title: 'Customisations · SPUNI',
  },
  { path: 'profile', loadComponent: () => import('./profile').then((m) => m.AccountProfile), title: 'Profile · SPUNI' },
  { path: '**', redirectTo: '' },
];
