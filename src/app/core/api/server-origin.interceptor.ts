import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { SERVER_API_ORIGIN } from './api-config';

/**
 * During SSR, relative URLs ('/api/v1/...') are sent straight to the API. It
 * runs after the hydration transfer cache, so cache keys stay relative and the
 * browser reuses the server's responses instead of fetching them again.
 */
export const serverOriginInterceptor: HttpInterceptorFn = (req, next) => {
  const origin = inject(SERVER_API_ORIGIN, { optional: true });
  if (!origin || !req.url.startsWith('/') || req.url.startsWith('//')) return next(req);
  return next(req.clone({ url: origin.replace(/\/$/, '') + req.url }));
};
