import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';

import { ProductCard, ProductDetail } from '../api/models';
import { safeStorage } from '../utils/storage';

export interface CartItem {
  product_id: number;
  quantity: number;
  name: string;
  slug: string;
  image_url: string | null;
  price_paise: number;
}

const KEY = 'spuni.cart.v1';
export const MAX_QTY = 10;
const MAX_LINES = 30;

/** The bag lives in the browser; prices shown here are display hints only —
 * the server re-prices everything for quotes and checkout. */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly items = signal<CartItem[]>(this.isBrowser ? this.load() : []);
  readonly drawerOpen = signal(false);
  readonly count = computed(() => this.items().reduce((sum, i) => sum + i.quantity, 0));
  readonly subtotalHint = computed(() => this.items().reduce((sum, i) => sum + i.price_paise * i.quantity, 0));
  readonly lines = computed(() => this.items().map((i) => ({ product_id: i.product_id, quantity: i.quantity })));
  /** Bumps whenever an item is added so the header bag can play its animation. */
  readonly pulse = signal(0);

  constructor() {
    effect(() => {
      const items = this.items();
      if (this.isBrowser) safeStorage.set(KEY, items);
    });
    if (this.isBrowser) {
      window.addEventListener('storage', (event) => {
        if (event.key === KEY) this.items.set(this.load());
      });
    }
  }

  add(product: ProductCard | ProductDetail, quantity = 1, openDrawer = true): void {
    this.items.update((items) => {
      const existing = items.find((i) => i.product_id === product.id);
      if (existing) {
        return items.map((i) =>
          i.product_id === product.id ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + quantity) } : i,
        );
      }
      if (items.length >= MAX_LINES) return items;
      return [
        ...items,
        {
          product_id: product.id,
          quantity: Math.min(MAX_QTY, quantity),
          name: product.name,
          slug: product.slug,
          image_url: product.image_url,
          price_paise: product.price_paise,
        },
      ];
    });
    this.pulse.update((v) => v + 1);
    if (openDrawer) this.drawerOpen.set(true);
  }

  setQuantity(productId: number, quantity: number): void {
    if (quantity <= 0) {
      this.remove(productId);
      return;
    }
    this.items.update((items) =>
      items.map((i) => (i.product_id === productId ? { ...i, quantity: Math.min(MAX_QTY, quantity) } : i)),
    );
  }

  remove(productId: number): void {
    this.items.update((items) => items.filter((i) => i.product_id !== productId));
  }

  /** Align local display data with the server quote (prices, names, stock). */
  syncFromQuote(lines: { product_id: number; unit_price_paise: number; name: string; image_url: string | null }[]): void {
    const byId = new Map(lines.map((l) => [l.product_id, l]));
    this.items.update((items) =>
      items.map((i) => {
        const line = byId.get(i.product_id);
        return line ? { ...i, price_paise: line.unit_price_paise, name: line.name, image_url: line.image_url } : i;
      }),
    );
  }

  clear(): void {
    this.items.set([]);
  }

  has(productId: number): boolean {
    return this.items().some((i) => i.product_id === productId);
  }

  private load(): CartItem[] {
    const raw = safeStorage.get<unknown>(KEY, []);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (i): i is CartItem =>
          !!i &&
          Number.isInteger((i as CartItem).product_id) &&
          Number.isInteger((i as CartItem).quantity) &&
          typeof (i as CartItem).name === 'string',
      )
      .map((i) => ({ ...i, quantity: Math.max(1, Math.min(MAX_QTY, i.quantity)) }))
      .slice(0, MAX_LINES);
  }
}
