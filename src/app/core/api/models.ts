/** Types mirroring the SPUNI API. All money values are integer paise. */

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'customer' | 'admin';
  marketing_opt_in: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
  is_new_user: boolean;
}

export interface OtpRequestResponse {
  message: string;
  resend_after_seconds: number;
  expires_in_seconds: number;
}

export interface CategoryRef {
  id: number;
  name: string;
  slug: string;
}

export interface Category extends CategoryRef {
  tagline: string | null;
  description: string | null;
  image_url: string | null;
  banner_url: string | null;
  sort_order: number;
  product_count: number;
}

export type Gender = 'men' | 'women' | 'unisex';

export interface ProductCard {
  id: number;
  name: string;
  slug: string;
  short_description: string | null;
  price_paise: number;
  compare_at_price_paise: number | null;
  badge: string | null;
  image_url: string | null;
  hover_image_url: string | null;
  in_stock: boolean;
  is_customizable: boolean;
  gender: Gender;
  category: CategoryRef;
}

export interface ProductImage {
  id: number;
  url: string;
  alt: string | null;
  sort_order: number;
}

export interface ProductDetail extends ProductCard {
  sku: string;
  description: string | null;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
  available_quantity: number;
  material: string | null;
  color: string | null;
  dimensions: string | null;
  weight_grams: number | null;
  care_instructions: string | null;
  images: ProductImage[];
  meta_title: string | null;
  meta_description: string | null;
  related: ProductCard[];
}

export interface MenuProduct {
  name: string;
  slug: string;
  gender: Gender;
}

export interface MenuCategory {
  name: string;
  slug: string;
  image_url: string | null;
  tagline: string | null;
  products: MenuProduct[];
}

export interface Menu {
  categories: MenuCategory[];
  featured: ProductCard[];
}

export interface Banner {
  id: number;
  title_one: string;
  title_two: string | null;
  image_url: string;
  alt: string | null;
  link_url: string | null;
}

export interface Launch {
  id: number;
  title: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  image_url: string | null;
  launch_at: string | null;
  status: 'upcoming' | 'launched';
  category: CategoryRef | null;
  product_slug: string | null;
  subscriber_count: number;
}

export interface HomeData {
  banners: Banner[];
  launches: Launch[];
  bestsellers: ProductCard[];
  featured: ProductCard[];
  categories: Category[];
}

export interface StoreInfo {
  support_email: string;
  support_phone: string;
  shipping_flat_paise: number;
  free_shipping_threshold_paise: number;
  gift_wrap_paise: number;
  wallet_earn_percent: number;
  wallet_max_redeem_percent: number;
  payment_mode: 'mock' | 'razorpay';
  razorpay_key_id: string | null;
}

export interface CartLine {
  product_id: number;
  quantity: number;
}

export interface QuoteLine {
  product_id: number;
  name: string;
  slug: string;
  image_url: string | null;
  unit_price_paise: number;
  quantity: number;
  line_total_paise: number;
  available_quantity: number;
  issue: string | null;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal_paise: number;
  shipping_paise: number;
  gift_wrap_paise: number;
  wallet_balance_paise: number;
  wallet_applied_paise: number;
  total_paise: number;
  wallet_reward_estimate_paise: number;
  free_shipping_threshold_paise: number;
  has_issues: boolean;
}

export interface AddressInput {
  label?: string | null;
  full_name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  postal_code: string;
  is_default?: boolean;
}

export interface Address extends Required<Omit<AddressInput, 'label' | 'line2' | 'landmark'>> {
  id: number;
  label: string | null;
  line2: string | null;
  landmark: string | null;
  country: string;
  created_at: string;
}

export interface GiftOptions {
  recipient_name: string;
  recipient_email?: string | null;
  message?: string | null;
  gift_wrap: boolean;
  hide_prices: boolean;
}

export interface CheckoutRequest {
  items: CartLine[];
  address_id?: number | null;
  address?: AddressInput | null;
  save_address: boolean;
  use_wallet: boolean;
  gift?: GiftOptions | null;
  note?: string | null;
  idempotency_key: string;
}

export interface PaymentInit {
  order_number: string;
  provider: 'mock' | 'razorpay';
  key_id: string | null;
  provider_order_id: string;
  amount_paise: number;
  currency: string;
  name: string;
  description: string;
  prefill_email: string;
  prefill_name: string | null;
  prefill_contact: string | null;
  requires_payment: boolean;
}

export interface PaymentVerifyRequest {
  order_number: string;
  provider_order_id: string;
  provider_payment_id: string;
  signature: string;
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

export interface OrderSummary {
  number: string;
  order_type: 'product' | 'gift_card';
  status: OrderStatus;
  payment_status: string;
  total_paise: number;
  item_count: number;
  first_image_url: string | null;
  created_at: string;
}

export interface Order {
  number: string;
  order_type: 'product' | 'gift_card';
  status: OrderStatus;
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
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
  can_cancel: boolean;
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

export interface Wallet {
  balance_paise: number;
  lifetime_earned_paise: number;
  earn_percent: number;
  max_redeem_percent: number;
  transactions: WalletTxn[];
}

export interface GiftCard {
  id: number;
  amount_paise: number;
  recipient_name: string;
  recipient_email: string;
  sender_name: string;
  message: string | null;
  status: 'pending_payment' | 'active' | 'redeemed' | 'cancelled';
  code_last4: string | null;
  activated_at: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  created_at: string;
  order_number: string | null;
}

export interface GiftConfig {
  min_paise: number;
  max_paise: number;
  presets_paise: number[];
  validity_days: number;
  gift_wrap_paise: number;
}

export interface GiftCardPurchase {
  amount_paise: number;
  recipient_name: string;
  recipient_email: string;
  sender_name: string;
  message?: string | null;
  idempotency_key: string;
}

export type CustomizationKind = 'catalog' | 'upload' | 'expert';

export interface CustomizationFile {
  id: number;
  url: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
}

export interface Customization {
  reference: string;
  kind: CustomizationKind;
  product_id: number | null;
  product_name: string | null;
  product_slug: string | null;
  details: string;
  personalization_text: string | null;
  budget_paise: number | null;
  preferred_contact: 'email' | 'phone' | 'whatsapp';
  phone: string | null;
  preferred_time: string | null;
  status: string;
  quoted_price_paise: number | null;
  customer_visible_note: string | null;
  files: CustomizationFile[];
  created_at: string;
  updated_at: string;
}

export interface ContactRequest {
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  website?: string | null;
}

export interface MessageResponse {
  message: string;
}

export interface ProductQuery {
  category?: string | null;
  gender?: Gender | null;
  q?: string | null;
  min_price?: number | null;
  max_price?: number | null;
  in_stock?: boolean | null;
  customizable?: boolean | null;
  /** Comma-separated product ids (guest wishlist). */
  ids?: string | null;
  sort?: 'featured' | 'newest' | 'price_asc' | 'price_desc' | 'name';
  page?: number;
  page_size?: number;
}
