import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.HomePage), title: 'SPUNI · Handcrafted Slaughter-Free Leather' },
  { path: 'shop', loadComponent: () => import('./pages/shop/shop').then((m) => m.ShopPage) },
  { path: 'category/:slug', data: { catalogKind: 'category' }, loadComponent: () => import('./pages/shop/shop').then((m) => m.ShopPage) },
  { path: 'subcategory/:slug', data: { catalogKind: 'subcategory' }, loadComponent: () => import('./pages/shop/shop').then((m) => m.ShopPage) },
  { path: 'product/:slug', loadComponent: () => import('./pages/product/product').then((m) => m.ProductPage) },
  { path: 'cart', loadComponent: () => import('./pages/cart/cart').then((m) => m.CartPage), title: 'Your bag · SPUNI' },
  {
    path: 'checkout',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/checkout/checkout').then((m) => m.CheckoutPage),
    title: 'Checkout · SPUNI',
  },
  {
    path: 'order/:number',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/order-complete/order-complete').then((m) => m.OrderCompletePage),
    title: 'Thank you · SPUNI',
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
    title: 'Sign in · SPUNI',
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/account/account-shell').then((m) => m.AccountShell),
    loadChildren: () => import('./pages/account/account.routes').then((m) => m.accountRoutes),
  },
  { path: 'wishlist', loadComponent: () => import('./pages/wishlist/wishlist').then((m) => m.WishlistPage), title: 'Wishlist · SPUNI' },
  { path: 'whats-new', loadComponent: () => import('./pages/whats-new/whats-new').then((m) => m.WhatsNewPage), title: "What's New · SPUNI" },
  { path: 'about', loadComponent: () => import('./pages/about/about').then((m) => m.AboutPage), title: 'Our Story · SPUNI' },
  { path: 'blog', loadComponent: () => import('./pages/blog/blog-list').then((m) => m.BlogListPage), title: 'Journal · SPUNI' },
  { path: 'blog/:slug', loadComponent: () => import('./pages/blog/blog-detail').then((m) => m.BlogDetailPage), title: 'Journal · SPUNI' },
  { path: 'customization', loadComponent: () => import('./pages/customization/customization').then((m) => m.CustomizationPage), title: 'Customise · SPUNI' },
  { path: 'gift', loadComponent: () => import('./pages/gift/gift').then((m) => m.GiftPage), title: 'Gift a loved one · SPUNI' },
  { path: 'contact', loadComponent: () => import('./pages/contact/contact').then((m) => m.ContactPage), title: 'Contact · SPUNI' },
  { path: 'unsubscribe', loadComponent: () => import('./pages/unsubscribe/unsubscribe').then((m) => m.UnsubscribePage), title: 'Unsubscribe · SPUNI' },
  {
    path: ':page',
    loadComponent: () => import('./pages/info/info').then((m) => m.InfoPage),
    canMatch: [
      (_route: unknown, segments: { path: string }[]) =>
        ['privacy', 'terms', 'shipping', 'returns', 'faq'].includes(segments[0]?.path ?? ''),
    ],
  },
  { path: '**', loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFoundPage), title: 'Page not found · SPUNI' },
];
