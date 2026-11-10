import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormGroup } from '@angular/forms';

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details: unknown;
  fields: FieldError[];
}

/** Normalise any thrown value (usually HttpErrorResponse with the SPUNI envelope) to ApiError. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { error?: { code?: string; message?: string; details?: unknown } } | null;
    const env = body && typeof body === 'object' ? body.error : undefined;
    const details = env?.details ?? null;
    const fields = Array.isArray(details)
      ? (details as unknown[])
          .filter((d): d is FieldError => !!d && typeof d === 'object' && 'message' in d)
          .map((d) => ({ field: String(d.field ?? ''), message: cleanMessage(String(d.message)) }))
      : [];
    let message = env?.message;
    if (!message) {
      if (err.status === 0) message = 'Cannot reach the server. Check your connection and try again.';
      else if (err.status >= 500) message = 'The server had a problem. Please try again.';
      else message = err.statusText || 'Request failed.';
    }
    return { status: err.status, code: env?.code ?? `http_${err.status}`, message, details, fields };
  }
  const message = err instanceof Error ? err.message : 'Something went wrong.';
  return { status: -1, code: 'client_error', message, details: null, fields: [] };
}

function cleanMessage(m: string): string {
  return m.replace(/^Value error,\s*/i, '').replace(/^./, (c) => c.toUpperCase());
}

/** Seconds to wait from a 429 response (details.retry_after), if present. */
export function retryAfter(e: ApiError): number | null {
  const d = e.details as { retry_after?: number } | null;
  return d && typeof d === 'object' && typeof d.retry_after === 'number' ? d.retry_after : null;
}

/**
 * Put 422 field messages onto matching form controls (as `server` errors).
 * Field paths like `images.0.url` are resolved through nested groups/arrays; fields that
 * do not match a control are returned so the caller can show them in a summary.
 * `aliases` maps API field names to control paths (e.g. price_paise -> price).
 */
export function applyServerErrors(
  form: FormGroup,
  e: ApiError,
  aliases: Record<string, string> = {},
): FieldError[] {
  const unmatched: FieldError[] = [];
  for (const f of e.fields) {
    const path = aliases[f.field] ?? f.field;
    const ctrl: AbstractControl | null = path ? form.get(path) : null;
    if (ctrl) {
      ctrl.setErrors({ ...(ctrl.errors ?? {}), server: f.message });
      ctrl.markAsTouched();
    } else {
      unmatched.push(f);
    }
  }
  return unmatched;
}
