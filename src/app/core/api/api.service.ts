import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_ORIGIN, API_PREFIX } from './api-config';
import { NO_AUTH_RETRY, SILENT } from './http-context';
import {
  Address,
  AddressInput,
  CartLine,
  Category,
  CheckoutRequest,
  ContactRequest,
  Customization,
  GiftCard,
  GiftCardPurchase,
  GiftConfig,
  HomeData,
  Launch,
  Menu,
  MessageResponse,
  Order,
  OrderSummary,
  OtpRequestResponse,
  Page,
  PaymentInit,
  PaymentVerifyRequest,
  ProductCard,
  ProductDetail,
  ProductQuery,
  Quote,
  StoreInfo,
  TokenResponse,
  User,
  Wallet,
} from './models';

/** Typed client for every SPUNI storefront endpoint. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly origin = inject(API_ORIGIN);

  url(path: string): string {
    return `${this.origin}${API_PREFIX}${path}`;
  }

  private silent(): HttpContext {
    return new HttpContext().set(SILENT, true);
  }

  // ------------------------------------------------------------- auth
  requestOtp(email: string): Observable<OtpRequestResponse> {
    return this.http.post<OtpRequestResponse>(this.url('/auth/otp/request'), { email });
  }

  resendOtp(email: string): Observable<OtpRequestResponse> {
    return this.http.post<OtpRequestResponse>(this.url('/auth/otp/resend'), { email });
  }

  verifyOtp(email: string, code: string, fullName?: string | null): Observable<TokenResponse> {
    const body: Record<string, string> = { email, code };
    if (fullName) body['full_name'] = fullName;
    return this.http.post<TokenResponse>(this.url('/auth/otp/verify'), body, { withCredentials: true });
  }

  refresh(): Observable<TokenResponse> {
    return this.http.post<TokenResponse>(this.url('/auth/refresh'), null, {
      withCredentials: true,
      context: this.silent().set(NO_AUTH_RETRY, true),
    });
  }

  logout(): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(this.url('/auth/logout'), null, {
      withCredentials: true,
      context: new HttpContext().set(NO_AUTH_RETRY, true),
    });
  }

  me(): Observable<User> {
    return this.http.get<User>(this.url('/auth/me'));
  }

  updateMe(body: Partial<Pick<User, 'full_name' | 'phone' | 'marketing_opt_in'>>): Observable<User> {
    return this.http.patch<User>(this.url('/auth/me'), body);
  }

  // ---------------------------------------------------------- catalog
  home(): Observable<HomeData> {
    return this.http.get<HomeData>(this.url('/home'));
  }

  store(): Observable<StoreInfo> {
    return this.http.get<StoreInfo>(this.url('/store'), { context: this.silent() });
  }

  menu(): Observable<Menu> {
    return this.http.get<Menu>(this.url('/menu'), { context: this.silent() });
  }

  categories(): Observable<Category[]> {
    return this.http.get<Category[]>(this.url('/categories'));
  }

  category(slug: string): Observable<Category> {
    return this.http.get<Category>(this.url(`/categories/${encodeURIComponent(slug)}`));
  }

  products(query: ProductQuery): Observable<Page<ProductCard>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Page<ProductCard>>(this.url('/products'), { params });
  }

  searchSuggest(q: string): Observable<Page<ProductCard>> {
    const params = new HttpParams().set('q', q).set('page_size', 6);
    return this.http.get<Page<ProductCard>>(this.url('/products'), { params, context: this.silent() });
  }

  product(slug: string): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(this.url(`/products/${encodeURIComponent(slug)}`));
  }

  launches(): Observable<Launch[]> {
    return this.http.get<Launch[]>(this.url('/launches'));
  }

  notifyLaunch(slug: string, email: string | null): Observable<{ subscribed: boolean; message: string }> {
    return this.http.post<{ subscribed: boolean; message: string }>(
      this.url(`/launches/${encodeURIComponent(slug)}/notify`),
      email ? { email } : {},
      { context: this.silent() },
    );
  }

  unsubscribe(token: string): Observable<MessageResponse> {
    const params = new HttpParams().set('token', token);
    return this.http.post<MessageResponse>(this.url('/launches/unsubscribe'), null, { params });
  }

  // ------------------------------------------------------------- shop
  quote(items: CartLine[], useWallet = false, giftWrap = false): Observable<Quote> {
    return this.http.post<Quote>(
      this.url('/cart/quote'),
      { items, use_wallet: useWallet, gift_wrap: giftWrap },
      { context: this.silent() },
    );
  }

  checkout(body: CheckoutRequest): Observable<PaymentInit> {
    return this.http.post<PaymentInit>(this.url('/checkout'), body);
  }

  retryPayment(number: string): Observable<PaymentInit> {
    return this.http.post<PaymentInit>(this.url(`/orders/${encodeURIComponent(number)}/pay`), {});
  }

  mockComplete(orderNumber: string, providerOrderId: string): Observable<{
    provider_order_id: string;
    provider_payment_id: string;
    signature: string;
  }> {
    return this.http.post<{ provider_order_id: string; provider_payment_id: string; signature: string }>(
      this.url('/payments/mock/complete'),
      { order_number: orderNumber, provider_order_id: providerOrderId },
    );
  }

  verifyPayment(body: PaymentVerifyRequest): Observable<Order> {
    return this.http.post<Order>(this.url('/payments/verify'), body);
  }

  paymentFailed(orderNumber: string, providerOrderId: string, reason?: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(
      this.url('/payments/failed'),
      { order_number: orderNumber, provider_order_id: providerOrderId, reason: reason?.slice(0, 300) ?? null },
      { context: this.silent() },
    );
  }

  orders(page = 1): Observable<Page<OrderSummary>> {
    return this.http.get<Page<OrderSummary>>(this.url('/orders'), { params: { page, page_size: 10 } });
  }

  order(number: string): Observable<Order> {
    return this.http.get<Order>(this.url(`/orders/${encodeURIComponent(number)}`));
  }

  cancelOrder(number: string, reason?: string): Observable<Order> {
    return this.http.post<Order>(this.url(`/orders/${encodeURIComponent(number)}/cancel`), { reason: reason || null });
  }

  // ---------------------------------------------------------- account
  addresses(): Observable<Address[]> {
    return this.http.get<Address[]>(this.url('/account/addresses'));
  }

  createAddress(body: AddressInput): Observable<Address> {
    return this.http.post<Address>(this.url('/account/addresses'), body);
  }

  updateAddress(id: number, body: AddressInput): Observable<Address> {
    return this.http.put<Address>(this.url(`/account/addresses/${id}`), body);
  }

  deleteAddress(id: number): Observable<void> {
    return this.http.delete<void>(this.url(`/account/addresses/${id}`));
  }

  wishlist(): Observable<ProductCard[]> {
    return this.http.get<ProductCard[]>(this.url('/account/wishlist'), { context: this.silent() });
  }

  addWishlist(productId: number): Observable<void> {
    return this.http.put<void>(this.url(`/account/wishlist/${productId}`), null, { context: this.silent() });
  }

  removeWishlist(productId: number): Observable<void> {
    return this.http.delete<void>(this.url(`/account/wishlist/${productId}`), { context: this.silent() });
  }

  wallet(silent = false): Observable<Wallet> {
    return this.http.get<Wallet>(this.url('/account/wallet'), silent ? { context: this.silent() } : {});
  }

  redeemGiftCard(code: string): Observable<GiftCard> {
    return this.http.post<GiftCard>(this.url('/account/wallet/redeem'), { code });
  }

  giftConfig(): Observable<GiftConfig> {
    return this.http.get<GiftConfig>(this.url('/gift-cards/config'));
  }

  buyGiftCard(body: GiftCardPurchase): Observable<PaymentInit> {
    return this.http.post<PaymentInit>(this.url('/account/gift-cards'), body);
  }

  myGiftCards(): Observable<GiftCard[]> {
    return this.http.get<GiftCard[]>(this.url('/account/gift-cards'));
  }

  // ------------------------------------------------------- engagement
  createCustomization(form: FormData): Observable<Customization> {
    return this.http.post<Customization>(this.url('/customizations'), form);
  }

  myCustomizations(): Observable<Customization[]> {
    return this.http.get<Customization[]>(this.url('/customizations'));
  }

  contact(body: ContactRequest): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(this.url('/contact'), body);
  }
}

/** Pulls a human message out of any HTTP error from the API. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const err = error as { status?: number; error?: { error?: { message?: string } } };
  if (err?.status === 0) return 'You seem to be offline. Check your connection and try again.';
  return err?.error?.error?.message || fallback;
}

export function apiErrorCode(error: unknown): string | null {
  const err = error as { error?: { error?: { code?: string } } };
  return err?.error?.error?.code ?? null;
}

export function apiFieldErrors(error: unknown): Record<string, string> {
  const err = error as { error?: { error?: { details?: { field: string; message: string }[] } } };
  const details = err?.error?.error?.details;
  const result: Record<string, string> = {};
  if (Array.isArray(details)) {
    for (const d of details) if (d?.field) result[d.field] = d.message;
  }
  return result;
}
