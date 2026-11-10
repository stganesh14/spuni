import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { rupeesToPaise } from './format';

/** Patterns mirrored from the backend schemas. */
export const PATTERNS = {
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  sku: /^[A-Z0-9-]{3,40}$/,
  phone: /^\+?[0-9]{10,15}$/,
  email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  mediaUrl: /^(\/media\/|https:\/\/)[^\s<>"']+$/,
  link: /^(\/[A-Za-z0-9/_\-?=&.%]*|https:\/\/[^\s<>"']+)$/,
  tracking: /^[A-Za-z0-9-]*$/,
  httpsUrl: /^(https:\/\/[^\s<>"']+)?$/,
};

const MAX_PAISE = 100_000_000;

/** Rupee amount typed by an admin. `min` is in paise (0 = allow zero, 1 = must be positive). */
export function rupees(opts: { required?: boolean; min?: number } = {}): ValidatorFn {
  const min = opts.min ?? 1;
  return (c: AbstractControl): ValidationErrors | null => {
    const raw = c.value;
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      return opts.required ? { required: true } : null;
    }
    const p = rupeesToPaise(raw);
    if (p === null) return { rupees: 'Enter an amount like 1499 or 1499.50' };
    if (p < min) return { rupees: min > 0 ? 'Must be more than ₹0' : 'Cannot be negative' };
    if (p > MAX_PAISE) return { rupees: 'Must be at most ₹10,00,000' };
    return null;
  };
}

export function intRange(min: number, max: number, required = true): ValidatorFn[] {
  const v: ValidatorFn[] = [Validators.min(min), Validators.max(max), Validators.pattern(/^-?\d+$/)];
  if (required) v.unshift(Validators.required);
  return v;
}

/** Human message for the first error on a control. */
export function errorMessage(c: AbstractControl | null, label = 'This field'): string | null {
  if (!c || !c.errors || !(c.touched || c.dirty)) return null;
  const e = c.errors;
  if (e['server']) return e['server'];
  if (e['required']) return `${label} is required.`;
  if (e['minlength']) return `${label} must be at least ${e['minlength'].requiredLength} characters.`;
  if (e['maxlength']) return `${label} must be at most ${e['maxlength'].requiredLength} characters.`;
  if (e['min']) return `${label} must be at least ${e['min'].min}.`;
  if (e['max']) return `${label} must be at most ${e['max'].max}.`;
  if (e['rupees']) return e['rupees'];
  if (e['email']) return 'Enter a valid email address.';
  if (e['pattern']) return patternMessage(String(e['pattern'].requiredPattern), label);
  for (const v of Object.values(e)) if (typeof v === 'string') return v;
  return `${label} is invalid.`;
}

function patternMessage(p: string, label: string): string {
  if (p === String(PATTERNS.slug)) return 'Use lowercase letters, numbers and single hyphens.';
  if (p === String(PATTERNS.sku)) return '3–40 characters: A–Z, 0–9 and hyphens.';
  if (p === String(PATTERNS.phone)) return 'Enter 10–15 digits, optionally starting with +.';
  if (p === String(PATTERNS.email)) return 'Enter a valid email address.';
  if (p === String(PATTERNS.link)) return 'Use a site path like /shop or a full https:// URL.';
  if (p === String(PATTERNS.httpsUrl)) return 'Must be a full https:// URL.';
  if (p === String(PATTERNS.tracking)) return 'Letters, numbers and hyphens only.';
  if (p === String(/^-?\d+$/)) return 'Enter a whole number.';
  return `${label} is not in the expected format.`;
}
