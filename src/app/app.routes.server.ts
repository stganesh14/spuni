import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Personal pages render in the browser only (they need the session cookie).
  { path: 'checkout', renderMode: RenderMode.Client },
  { path: 'order/:number', renderMode: RenderMode.Client },
  { path: 'login', renderMode: RenderMode.Client },
  { path: 'account', renderMode: RenderMode.Client },
  { path: 'account/**', renderMode: RenderMode.Client },
  { path: 'cart', renderMode: RenderMode.Client },
  { path: 'wishlist', renderMode: RenderMode.Client },
  { path: 'unsubscribe', renderMode: RenderMode.Client },
  // Everything public is rendered per request so catalogue changes show up instantly.
  { path: '**', renderMode: RenderMode.Server },
];
