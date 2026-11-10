const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** Formats integer paise as Indian rupees, e.g. 1499900 -> ₹14,999. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return '';
  return formatter.format(paise / 100);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
