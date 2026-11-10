import { OrderStatus } from '../api/models';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  processing: 'Being crafted',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  expired: 'Expired',
};

export const ORDER_STEPS: OrderStatus[] = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];

export function statusTone(status: string): 'good' | 'bad' | '' {
  if (['delivered', 'confirmed', 'shipped', 'out_for_delivery', 'active', 'completed', 'accepted'].includes(status))
    return 'good';
  if (['cancelled', 'refunded', 'expired', 'rejected', 'failed'].includes(status)) return 'bad';
  return '';
}

export const WALLET_REASON_LABEL: Record<string, string> = {
  order_reward: 'Order reward',
  order_redeem: 'Used at checkout',
  redeem_reversal: 'Points returned',
  reward_reversal: 'Reward reversed',
  gift_card: 'Gift card redeemed',
  admin_adjust: 'Adjustment by SPUNI',
};

export const CUSTOMIZATION_STATUS_LABEL: Record<string, string> = {
  new: 'Received',
  in_review: 'In review',
  quoted: 'Quote ready',
  accepted: 'Accepted',
  in_progress: 'Being crafted',
  completed: 'Completed',
  rejected: 'Declined',
  cancelled: 'Closed',
};

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
];
