import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';

import { SILENT } from '../api/http-context';
import { Loader } from '../services/loader';

/** Drives the top progress bar for every API call not flagged SILENT. */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SILENT)) return next(req);
  const loader = inject(Loader);
  loader.show();
  return next(req).pipe(finalize(() => loader.hide()));
};
