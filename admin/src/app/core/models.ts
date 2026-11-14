/** Typed shapes of the SPUNI admin API (see backend/app/schemas/admin.py). Money is integer paise. */

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface UserOut {
  id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  marketing_opt_in: boolean;
  created_at: string;
}

export interface TokenOut {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserOut;
  is_new_user: boolean;
}

export interface OtpRequestOut {
  message: string;
  resend_after_seconds: number;
  expires_in_seconds: number;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  image_url: string | null;
  banner_url: string | null;
  sort_order: number;
  is_active: boolean;
  show_in_menu: boolean;
  product_count: number;
  created_at: string;
  updated_at: string;
}

export type CategoryIn = Omit<Category, 'id' | 'product_count' | 'created_at' | 'updated_at'>;

export interface ProductImage {
  id?: number;
  url: string;
  alt: string | null;
  sort_order?: number;
}

export type Gender = 'men' | 'women' | 'unisex';

export interface Product {
  id: number;
  category_id: number;
  category_name: string;
  name: string;
  slug: string;
  sku: string;
  short_description: string | null;
  description: string | null;
  price_paise: number;
  compare_at_price_paise: number | null;
  stock: number;
  gender: Gender;
  material: string | null;
  color: string | null;
  dimensions: string | null;
  weight_grams: number | null;
  care_instructions: string | null;
  badge: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_bestseller: boolean;
  is_customizable: boolean;
  sort_order: number;
  meta_title: string | null;
  meta_description: string | null;
  images: ProductImage[];
  created_at: string;
  updated_at: string;
}

export interface ProductIn {
  category_id: number;
  name: string;
  slug: string;
  sku: string;
  short_description: string | null;
  description: string | null;
  price_paise: number;
  compare_at_price_paise: number | null;
  stock: number;
  gender: Gender;
  material: string | null;
  color: string | null;
  dimensions: string | null;
  weight_grams: number | null;
  care_instructions: string | null;
  badge: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_bestseller: boolean;
  is_customizable: boolean;
  sort_order: number;
  meta_title: string | null;
  meta_description: string | null;
  images: { url: string; alt: string | null }[];
}

export type ProductStatusFilter = 'all' | 'active' | 'inactive' | 'low_stock' | 'out_of_stock';

export type LaunchStatus = 'draft' | 'upcoming' | 'launched' | 'archived';

export interface Launch {
  id: number;
  title: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  image_url: string | null;
  launch_at: string | null;
  status: LaunchStatus;
  category_id: number | null;
  product_id: number | null;
  sort_order: number;
  notified_at: string | null;
  notify_count: number;
  subscriber_count: number;
  pending_count: number;
  created_at: string;
}

export interface LaunchIn {
  title: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  image_url: string | null;
  launch_at: string | null;
  status: LaunchStatus;
  category_id: number | null;
  product_id: number | null;
  sort_order: number;
}

export interface LaunchSubscriber {
  email: string;
  created_at: string;
  notified_at: string | null;
  unsubscribed_at: string | null;
}

export interface LaunchNotifyOut {
  queued: number;
  message: string;
}

export interface Banner {
  id: number;
  title_one: string;
  title_two: string | null;
  image_url: string;
  alt: string | null;
  link_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export type BannerIn = Omit<Banner, 'id'>;

export type OrderStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'expired';

export const ORDER_STATUSES: OrderStatus[] = [
  'pending_payment',
  'confirmed',
  'processing',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'refunded',
  'expired',
];

export interface OrderRow {
  number: string;
  order_type: string;
  status: OrderStatus;
  payment_status: string;
  total_paise: number;
  item_count: number;
  customer_name: string | null;
  email: string;
  is_gift: boolean;
  created_at: string;
  allowed_transitions: OrderStatus[];
}

export interface OrderItem {
  id: number;
  product_id: number | null;
  product_name: string;
  product_slug: string | null;
  sku: string | null;
  image_url: string | null;
  unit_price_paise: number;
  quantity: number;
  line_total_paise: number;
}

export interface OrderEvent {
  status: string;
  note: string | null;
  created_at: string;
}

export interface Payment {
  provider: string;
  provider_order_id: string;
  provider_payment_id: string | null;
  amount_paise: number;
  status: string;
  method: string | null;
  error_description: string | null;
  created_at: string;
}

export interface Order {
  id: number;
  user_id: number;
  number: string;
  order_type: string;
  status: OrderStatus;
  payment_status: string;
  email: string;
  subtotal_paise: number;
  shipping_paise: number;
  gift_wrap_paise: number;
  wallet_redeemed_paise: number;
  total_paise: number;
  wallet_earned_paise: number;
  ship_name: string | null;
  ship_phone: string | null;
  ship_line1: string | null;
  ship_line2: string | null;
  ship_landmark: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_postal_code: string | null;
  is_gift: boolean;
  gift_wrap: boolean;
  gift_recipient_name: string | null;
  gift_recipient_email: string | null;
  gift_hide_prices: boolean;
  gift_message: string | null;
  customer_note: string | null;
  courier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  created_at: string;
  items: OrderItem[];
  events: OrderEvent[];
  payments: Payment[];
  admin_note: string | null;
  allowed_transitions: OrderStatus[];
  can_cancel: boolean;
}

export interface OrderStatusIn {
  status: OrderStatus;
  note: string | null;
  courier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  notify_customer: boolean;
}

export interface CustomerRow {
  id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'customer' | 'admin';
  is_active: boolean;
  order_count: number;
  total_spent_paise: number;
  wallet_balance_paise: number;
  wallet_cash_value_paise: number;
  last_login_at: string | null;
  created_at: string;
}

export interface WalletTxn {
  id: number;
  type: 'credit' | 'debit';
  reason: string;
  amount_paise: number;
  balance_after_paise: number;
  note: string | null;
  order_number: string | null;
  created_at: string;
}

export interface CustomerDetail {
  customer: CustomerRow;
  orders: OrderRow[];
  wallet: {
    balance_paise: number;
    lifetime_earned_paise: number;
    cash_value_paise: number;
    transactions: WalletTxn[];
  };
}

export interface WalletAdjustIn {
  direction: 'credit' | 'debit';
  amount_cash_hundredths: number;
  note: string;
  notify_customer: boolean;
}

export type CustomizationStatus =
  | 'new'
  | 'in_review'
  | 'quoted'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export const CUSTOMIZATION_STATUSES: CustomizationStatus[] = [
  'new',
  'in_review',
  'quoted',
  'accepted',
  'in_progress',
  'completed',
  'rejected',
  'cancelled',
];

export interface CustomizationFile {
  url: string;
  original_name: string | null;
  content_type: string;
  size_bytes: number;
}

export interface Customization {
  reference: string;
  kind: string;
  status: CustomizationStatus;
  user_id: number;
  customer_email: string;
  customer_name: string | null;
  product_id: number | null;
  product_name: string | null;
  details: string;
  personalization_text: string | null;
  budget_paise: number | null;
  preferred_contact: string;
  phone: string | null;
  preferred_time: string | null;
  quoted_price_paise: number | null;
  admin_notes: string | null;
  customer_visible_note: string | null;
  files: CustomizationFile[];
  created_at: string;
  updated_at: string;
}

export interface CustomizationUpdateIn {
  status?: CustomizationStatus;
  quoted_price_paise?: number | null;
  admin_notes?: string | null;
  customer_visible_note?: string | null;
  notify_customer: boolean;
}

export interface GiftCard {
  id: number;
  order_number: string;
  amount_paise: number;
  sender_name: string;
  recipient_name: string;
  recipient_email: string;
  purchaser_email: string;
  status: string;
  code_last4: string | null;
  activated_at: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  created_at: string;
}

export type ContactStatus = 'new' | 'read' | 'closed';

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: ContactStatus;
  created_at: string;
}

export type EmailStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface EmailLog {
  id: number;
  to_email: string;
  subject: string;
  template: string;
  status: EmailStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface StoreSettings {
  wallet_max_redeem_percent: number;
  wallet_cash_value_paise: number;
  wallet_tier_1_limit_paise: number;
  wallet_tier_2_limit_paise: number;
  wallet_tier_3_limit_paise: number;
  wallet_tier_1_percent: number;
  wallet_tier_2_percent: number;
  wallet_tier_3_percent: number;
  wallet_tier_4_percent: number;
  shipping_flat_paise: number;
  free_shipping_threshold_paise: number;
  gift_wrap_paise: number;
  gift_card_min_paise: number;
  gift_card_max_paise: number;
  gift_card_validity_days: number;
  support_email: string;
  support_phone: string;
  updated_at?: string;
}

export interface DashboardPoint {
  date: string;
  revenue_paise: number;
  orders: number;
}

export interface Dashboard {
  revenue_today_paise: number;
  revenue_30d_paise: number;
  orders_today: number;
  orders_30d: number;
  avg_order_value_paise: number;
  pending_fulfilment: number;
  awaiting_payment: number;
  low_stock: { id: number; name: string; sku: string; stock: number }[];
  new_customers_30d: number;
  open_customizations: number;
  unread_messages: number;
  launch_subscribers: number;
  wallet_liability_paise: number;
  series: DashboardPoint[];
  top_products: { name: string; quantity: number; revenue_paise: number }[];
  recent_orders: OrderRow[];
  status_breakdown: Record<string, number>;
}

export type MediaFolder = 'products' | 'categories' | 'launches' | 'banners';
