import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · SPUNI Admin',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Dashboard · SPUNI Admin',
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'products',
        title: 'Products · SPUNI Admin',
        loadComponent: () => import('./pages/products/product-list').then((m) => m.ProductListPage),
      },
      {
        path: 'products/new',
        title: 'New product · SPUNI Admin',
        loadComponent: () => import('./pages/products/product-form').then((m) => m.ProductFormPage),
      },
      {
        path: 'products/:id',
        title: 'Edit product · SPUNI Admin',
        loadComponent: () => import('./pages/products/product-form').then((m) => m.ProductFormPage),
      },
      {
        path: 'categories',
        title: 'Categories · SPUNI Admin',
        loadComponent: () => import('./pages/categories/categories').then((m) => m.CategoriesPage),
      },
      {
        path: 'launches',
        title: "What's new · SPUNI Admin",
        loadComponent: () => import('./pages/launches/launches').then((m) => m.LaunchesPage),
      },
      {
        path: 'banners',
        title: 'Hero banners · SPUNI Admin',
        loadComponent: () => import('./pages/banners/banners').then((m) => m.BannersPage),
      },
      {
        path: 'orders',
        title: 'Orders · SPUNI Admin',
        loadComponent: () => import('./pages/orders/order-list').then((m) => m.OrderListPage),
      },
      {
        path: 'orders/:number',
        title: 'Order · SPUNI Admin',
        loadComponent: () => import('./pages/orders/order-detail').then((m) => m.OrderDetailPage),
      },
      {
        path: 'customers',
        title: 'Customers · SPUNI Admin',
        loadComponent: () => import('./pages/customers/customer-list').then((m) => m.CustomerListPage),
      },
      {
        path: 'customers/:id',
        title: 'Customer · SPUNI Admin',
        loadComponent: () => import('./pages/customers/customer-detail').then((m) => m.CustomerDetailPage),
      },
      {
        path: 'customizations',
        title: 'Customizations · SPUNI Admin',
        loadComponent: () => import('./pages/customizations/customization-list').then((m) => m.CustomizationListPage),
      },
      {
        path: 'customizations/:reference',
        title: 'Customization · SPUNI Admin',
        loadComponent: () =>
          import('./pages/customizations/customization-detail').then((m) => m.CustomizationDetailPage),
      },
      {
        path: 'gift-cards',
        title: 'Gift cards · SPUNI Admin',
        loadComponent: () => import('./pages/gift-cards/gift-cards').then((m) => m.GiftCardsPage),
      },
      {
        path: 'messages',
        title: 'Messages · SPUNI Admin',
        loadComponent: () => import('./pages/messages/messages').then((m) => m.MessagesPage),
      },
      {
        path: 'emails',
        title: 'Email log · SPUNI Admin',
        loadComponent: () => import('./pages/emails/emails').then((m) => m.EmailsPage),
      },
      {
        path: 'settings',
        title: 'Settings · SPUNI Admin',
        loadComponent: () => import('./pages/settings/settings').then((m) => m.SettingsPage),
      },
      {
        path: '**',
        title: 'Not found · SPUNI Admin',
        loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFoundPage),
      },
    ],
  },
];
