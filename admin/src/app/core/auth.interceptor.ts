import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { API_BASE, API_PREFIX } from './api-base';
import { AuthService, SKIP_AUTH_REFRESH } from './auth.service';

/**
 * Adds the in-memory bearer token to API calls. On a 401 it refreshes the token once
 * (concurrent requests share the same refresh) and retries; if that fails the user is
 * sent to the login screen.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const base = inject(API_BASE);
  const isApi = req.url.startsWith(`${base}${API_PREFIX}/`);
  if (!isApi || req.context.get(SKIP_AUTH_REFRESH)) {
    return next(req);
  }

  const withToken = (r: HttpRequest<unknown>, token: string | null) =>
    token ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r;

  return next(withToken(req, auth.token())).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }
      return auth.refresh().pipe(
        switchMap((token) => {
          if (!token) {
            auth.sessionExpired();
            return throwError(() => err);
          }
          return next(withToken(req, token));
        }),
      );
    }),
  );
};
