import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Origin of the SPUNI API. Empty string = same origin as the admin app
 * (dev proxy or a reverse proxy in production). Can be an absolute URL.
 */
export const API_BASE = new InjectionToken<string>('API_BASE', {
  providedIn: 'root',
  factory: () => environment.apiBase.replace(/\/+$/, ''),
});

export const API_PREFIX = '/api/v1';

/** Resolve a media URL (relative `/media/...`) against the API origin. */
export function mediaUrl(base: string, url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  return `${base}${url}`;
}
