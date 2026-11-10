const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const fraction = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1499900 -> "₹14,999"; 14999950 -> "₹1,49,999.50"; negatives keep the sign. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return '—';
  const sign = paise < 0 ? '−' : '';
  const abs = Math.abs(Math.round(paise));
  const rupees = abs / 100;
  return `${sign}₹${abs % 100 === 0 ? whole.format(rupees) : fraction.format(rupees)}`;
}

/** Compact for chart axes: ₹1.2L, ₹3.4Cr, ₹12k. */
export function formatPaiseShort(paise: number): string {
  const r = paise / 100;
  if (r >= 1e7) return `₹${trim(r / 1e7)}Cr`;
  if (r >= 1e5) return `₹${trim(r / 1e5)}L`;
  if (r >= 1e3) return `₹${trim(r / 1e3)}k`;
  return `₹${Math.round(r)}`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

/** Rupee input (string/number, may contain commas) -> integer paise, or null when empty/invalid. */
export function rupeesToPaise(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/[,\s₹]/g, '');
  if (s === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [r, p = ''] = s.split('.');
  return Number(r) * 100 + Number((p + '00').slice(0, 2));
}

/** Integer paise -> plain rupee string for an input ("14999" or "14999.5"). */
export function paiseToRupees(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '';
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return p === 0 ? String(r) : `${r}.${String(p).padStart(2, '0')}`;
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
    .replace(/-+$/g, '');
}

export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const s = value.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Button/menu wording for moving an order to `status`. */
export function orderActionLabel(status: string): string {
  switch (status) {
    case 'processing':
      return 'Start processing';
    case 'shipped':
      return 'Mark as shipped';
    case 'out_for_delivery':
      return 'Out for delivery';
    case 'delivered':
      return 'Mark as delivered';
    case 'cancelled':
      return 'Cancel order';
    case 'refunded':
      return 'Refund order';
    default:
      return humanize(status);
  }
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (withTime ? dateTimeFmt : dateFmt).format(d);
}

/** ISO string -> value for <input type="datetime-local"> in the browser's local time. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value -> ISO string with timezone (UTC), or null. */
export function localInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Empty / whitespace-only string -> null (the API treats null as "not set"). */
export function nullIfBlank(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}
