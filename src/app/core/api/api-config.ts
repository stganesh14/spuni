import { InjectionToken } from '@angular/core';

/**
 * Origin of the SPUNI API. In the browser this is '' (same origin: the dev
 * proxy or the production reverse proxy forwards /api and /media). During SSR
 * the server provides an absolute URL (API_ORIGIN env var).
 */
export const API_ORIGIN = new InjectionToken<string>('API_ORIGIN', {
  providedIn: 'root',
  factory: () => '',
});

export const API_PREFIX = '/api/v1';

/** Server-only: where SSR sends relative API requests (e.g. http://127.0.0.1:8000). */
export const SERVER_API_ORIGIN = new InjectionToken<string>('SERVER_API_ORIGIN');
