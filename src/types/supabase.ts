/**
 * Centralized Supabase types used across the app.
 * These mirror the public schema tables and views.
 */

/** Profiles table and profile_with_email view */
export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: 'admin' | 'requester';
  updated_at: string;
  is_approved: boolean;
  country: string | null;
  user_email?: string | null;
};

/** Payment Requests */
export type PaymentRequestStatus =
  | 'pending'
  | 'setup_awaiting_approval'
  | 'approved'
  | 'declined'
  | 'queried';

export type PaymentRequest = {
  id: string;
  requester_id: string;
  supplier_name: string;
  sku_number: string | null;
  not_sku_related: boolean;
  lease_id: string | null;
  supplier_address: string;
  iban_number: string | null;
  sort_code: string | null;
  account_number: string | null;
  bank_account_name: string | null;
  currency: string | null;
  payment_amount: number | null;
  reason_for_payment: string;
  date_payment_required: string;
  invoice_pdf_urls: string[];
  status: PaymentRequestStatus;
  admin_action_by: string | null;
  admin_action_reason: string | null;
  receipt_pdf_url: string | null;
  created_at: string;
  updated_at: string;
  payment_setup_date: string | null;
  payment_approved_date: string | null;
  receipt_required: boolean;
  is_urgent: boolean;
  country: string;
  last_reminder_sent_at: string | null;
  is_reminded: boolean;
  category: string;
  bank_details_verified: boolean;
};

/** Payment Request Audits */
export type PaymentRequestAudit = {
  id: string;
  payment_request_id: string;
  changed_by_user_id: string | null;
  change_description: string;
  changed_at: string;
};

/** Transactions */
export type TransactionStatus = 'pending_input' | 'completed' | 'approved' | 'declined' | 'queried' | string;

export type Transaction = {
  id: string;
  requester_id: string;
  uploaded_by_user_id: string | null;
  original_transaction_id: string | null;
  status: string;
  type: string | null;
  transaction_date: string;
  entry: string | null;
  description: string;
  amount: number;
  bank: string | null;
  contra_account: string | null;
  currency: string;
  exchange_rate: number | null;
  comment: string | null;
  sku: string | null;
  reason_for_payment: string | null;
  receipt_urls: string[] | null;
  category: string | null;
  merchant_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  not_sku_related: boolean;
  country: string;
  bank_account: string | null; // NEW: Added bank_account
};

/** Transaction Audits */
export type TransactionAudit = {
  id: string;
  transaction_id: string;
  changed_by_user_id: string | null;
  change_description: string;
  changed_at: string | null;
};

/** Direct Debits */
export type DirectDebitStatus = 'active' | 'cancelled' | 'paused' | 'pending' | 'awaiting_info';

export type DirectDebit = {
  id: string;
  created_at: string;
  updated_at: string;
  requester_id: string;
  payee: string | null;
  payment_date: string | null;
  payment_day?: number | null;
  sku: string | null;
  not_property_related: boolean;
  category: string | null;
  account_number: string | null;
  payment_reference: string | null;
  status: DirectDebitStatus;
  country: string;
  bank_account: string | null;
};

/** Direct Debit Audits */
export type DirectDebitAudit = {
  id: string;
  direct_debit_id: string;
  changed_by_user_id: string | null;
  change_description: string;
  changed_at: string | null;
};

/** Standing Orders */
export type StandingOrderStatus = 'active' | 'cancelled' | 'paused' | 'pending' | 'awaiting_info';

export type StandingOrderCategoryItem = {
  category: string;
  amount: number;
};

export type StandingOrder = {
  id: string;
  created_at: string;
  updated_at: string;
  requester_id: string;
  payee: string;
  payment_date: string;
  payment_end_date?: string | null;
  sku: string | null;
  not_property_related: boolean;
  categories: StandingOrderCategoryItem[];
  account_name: string;
  account_address: string | null;
  iban_number: string | null;
  sort_code: string | null;
  account_number: string | null;
  from_day: number;
  to_day: number;
  payment_reference: string;
  comments?: string | null;
  status: StandingOrderStatus;
  country: string;
  bank_details_verified: boolean;
  total_amount: number;
  payment_day?: number | null;
  currency?: string | null;
  bank_account?: string | null;
};

/** Standing Order Audits */
export type StandingOrderAudit = {
  id: string;
  standing_order_id: string;
  changed_by_user_id: string | null;
  change_description: string;
  changed_at: string | null;
};

/** Notifications */
export type Notification = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string | null;
  type: string | null;
};

/** Feedback */
export type Feedback = {
  id: string;
  feedback_types: string[];
  message: string;
  created_at: string | null;
  is_read: boolean;
  user_id: string | null;
};