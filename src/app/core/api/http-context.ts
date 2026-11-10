import { HttpContextToken } from '@angular/common/http';

/** Requests flagged SILENT do not drive the top progress bar. */
export const SILENT = new HttpContextToken<boolean>(() => false);

/** Requests flagged NO_AUTH_RETRY never trigger a token refresh on 401. */
export const NO_AUTH_RETRY = new HttpContextToken<boolean>(() => false);
