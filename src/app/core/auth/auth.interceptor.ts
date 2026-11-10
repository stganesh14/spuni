import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { API_PREFIX } from '../api/api-config';
import { NO_AUTH_RETRY } from '../api/http-context';
import { AuthService } from './auth.service';

function withAuth(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  const headers: Record<string, string> = { 'X-Requested-With': 'spuni' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return req.clone({ setHeaders: headers });
}

/** Adds the bearer token to API calls and transparently refreshes it once on 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes(API_PREFIX)) return next(req);
  const auth = inject(AuthService);
  const isAuthEndpoint = req.url.includes(`${API_PREFIX}/auth/`) && !req.url.endsWith('/auth/me');

  return next(withAuth(req, auth.accessToken())).pipe(
    catchError((error: unknown) => {
      const canRetry =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isAuthEndpoint &&
        !req.context.get(NO_AUTH_RETRY) &&
        auth.accessToken() !== null;
      if (!canRetry) return throwError(() => error);
      return auth.refresh().pipe(
        switchMap((token) => (token ? next(withAuth(req, token)) : throwError(() => error))),
      );
    }),
  );
};
