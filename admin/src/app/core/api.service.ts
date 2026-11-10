import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, API_PREFIX } from './api-base';
import {
  Banner,
  BannerIn,
  Category,
  CategoryIn,
  ContactMessage,
  ContactStatus,
  CustomerDetail,
  CustomerRow,
  Customization,
  CustomizationUpdateIn,
  Dashboard,
  EmailLog,
  GiftCard,
  Launch,
  LaunchIn,
  LaunchNotifyOut,
  LaunchSubscriber,
  MediaFolder,
  Order,
  OrderRow,
  OrderStatusIn,
  Page,
  Product,
  ProductIn,
  StoreSettings,
  UserOut,
  WalletAdjustIn,
} from './models';

type Params = Record<string, string | number | boolean | null | undefined>;

function toParams(p: Params = {}): HttpParams {
  let params = new HttpParams();
  for (const [k, v] of Object.entries(p)) {
    if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
  }
  return params;
}

/** Thin typed client for /api/v1/admin. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly root = `${inject(API_BASE)}${API_PREFIX}/admin`;

  private get<T>(path: string, params?: Params): Observable<T> {
    return this.http.get<T>(this.root + path, { params: toParams(params) });
  }
  private post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.root + path, body);
  }
  private put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.root + path, body);
  }
  private patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.root + path, body);
  }
  private del(path: string): Observable<void> {
    return this.http.delete<void>(this.root + path);
  }

  me = () => this.get<UserOut>('/me');
  dashboard = () => this.get<Dashboard>('/dashboard');

  upload(folder: MediaFolder, file: File): Observable<{ url: string; size_bytes: number }> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.post(`/media/${folder}`, form);
  }

  // catalogue
  categories = () => this.get<Category[]>('/categories');
  createCategory = (b: CategoryIn) => this.post<Category>('/categories', b);
  updateCategory = (id: number, b: CategoryIn) => this.put<Category>(`/categories/${id}`, b);
  deleteCategory = (id: number) => this.del(`/categories/${id}`);

  products = (p: Params) => this.get<Page<Product>>('/products', p);
  product = (id: number) => this.get<Product>(`/products/${id}`);
  createProduct = (b: ProductIn) => this.post<Product>('/products', b);
  updateProduct = (id: number, b: ProductIn) => this.put<Product>(`/products/${id}`, b);
  setStock = (id: number, stock: number) => this.patch<Product>(`/products/${id}/stock`, { stock });
  deleteProduct = (id: number) => this.del(`/products/${id}`);

  banners = () => this.get<Banner[]>('/banners');
  createBanner = (b: BannerIn) => this.post<Banner>('/banners', b);
  updateBanner = (id: number, b: BannerIn) => this.put<Banner>(`/banners/${id}`, b);
  deleteBanner = (id: number) => this.del(`/banners/${id}`);

  launches = () => this.get<Launch[]>('/launches');
  createLaunch = (b: LaunchIn) => this.post<Launch>('/launches', b);
  updateLaunch = (id: number, b: LaunchIn) => this.put<Launch>(`/launches/${id}`, b);
  deleteLaunch = (id: number) => this.del(`/launches/${id}`);
  launchSubscribers = (id: number) => this.get<LaunchSubscriber[]>(`/launches/${id}/subscribers`);
  notifyLaunch = (id: number, body: { message: string | null; mark_launched: boolean }) =>
    this.post<LaunchNotifyOut>(`/launches/${id}/notify`, body);

  // operations
  orders = (p: Params) => this.get<Page<OrderRow>>('/orders', p);
  order = (n: string) => this.get<Order>(`/orders/${encodeURIComponent(n)}`);
  setOrderStatus = (n: string, b: OrderStatusIn) => this.post<Order>(`/orders/${encodeURIComponent(n)}/status`, b);
  setOrderNote = (n: string, admin_note: string | null) =>
    this.patch<Order>(`/orders/${encodeURIComponent(n)}/note`, { admin_note });

  customers = (p: Params) => this.get<Page<CustomerRow>>('/customers', p);
  customer = (id: number) => this.get<CustomerDetail>(`/customers/${id}`);
  updateCustomer = (id: number, b: { is_active?: boolean; role?: 'customer' | 'admin' }) =>
    this.patch<CustomerRow>(`/customers/${id}`, b);
  adjustWallet = (id: number, b: WalletAdjustIn) => this.post<{ balance_paise: number }>(`/customers/${id}/wallet`, b);

  giftCards = (status?: string) => this.get<GiftCard[]>('/gift-cards', { status });

  customizations = (status?: string) => this.get<Customization[]>('/customizations', { status });
  customization = (ref: string) => this.get<Customization>(`/customizations/${encodeURIComponent(ref)}`);
  updateCustomization = (ref: string, b: CustomizationUpdateIn) =>
    this.patch<Customization>(`/customizations/${encodeURIComponent(ref)}`, b);

  messages = (status?: string) => this.get<ContactMessage[]>('/messages', { status });
  setMessageStatus = (id: number, status: ContactStatus) => this.patch<ContactMessage>(`/messages/${id}`, { status });

  emails = (p: Params) => this.get<Page<EmailLog>>('/emails', p);
  retryEmail = (id: number) => this.post<EmailLog>(`/emails/${id}/retry`, {});

  settings = () => this.get<StoreSettings>('/settings');
  saveSettings = (b: StoreSettings) => this.put<StoreSettings>('/settings', b);
}
