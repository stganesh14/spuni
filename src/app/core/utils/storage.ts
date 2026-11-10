/** Session flag set by the gift page; checkout opens with "Send it as a gift" switched on. */
export const GIFT_INTENT_KEY = 'spuni.gift.intent';

/** localStorage access that never throws (SSR, private mode, blocked storage). */
export const safeStorage = {
  get<T>(key: string, fallback: T): T {
    try {
      if (typeof localStorage === 'undefined') return fallback;
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked: the in-memory state still works */
    }
  },
  remove(key: string): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  session(key: string): string | null {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setSession(key: string, value: string): void {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};
