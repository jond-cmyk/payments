export type PaymentRequest = {
  id: string;
  requester_id: string;
  supplier_name: string;
  sku_number: string;
  not_sku_related: boolean; // New field
  lease_id: string | null; // New field
  supplier_address: string;
  iban_number: string | null; // Made nullable
  sort_code: string | null; // New field
  account_number: string | null; // New field
  bank_account_name: string | null; // New field
  currency: string; // New field
  payment_amount: number; // New field
  reason_for_payment: string;
  date_payment_required: string; // YYYY-MM-DD format
  invoice_pdf_urls: string[]; // Changed to array of strings
  status: 'pending' | 'setup_awaiting_approval' | 'approved' | 'declined' | 'queried'; // Updated status type
  admin_action_by: string | null;
  admin_action_reason: string | null;
  receipt_pdf_url: string | null;
  created_at: string;
  updated_at: string;
  payment_setup_date: string | null; // New field
  payment_approved_date: string | null; // New field
  receipt_required: boolean; // New field
  is_urgent: boolean; // New field for urgent requests
  country: string; // New field for country
  last_reminder_sent_at: string | null; // NEW: Last time a reminder was sent
  is_reminded: boolean; // NEW: Flag if a reminder has been sent
  category: string; // NEW: Category field
  bank_details_verified: boolean; // NEW: Bank details verified checkbox
};

export type Transaction = {
  id: string;
  requester_id: string;
  uploaded_by_user_id: string | null;
  original_transaction_id: string | null;
  status: 'pending_input' | 'completed' | 'approved' | 'declined';
  type: string | null;
  transaction_date: string; // YYYY-MM-DD format
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
  receipt_urls: string[]; // Array for multiple document URLs
  category: string | null;
  merchant_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  not_sku_related: boolean; // New field
  country: string; // New field for country
};

export type DirectDebit = {
  id: string;
  created_at: string;
  updated_at: string;
  requester_id: string;
  payee: string;
  payment_date: string; // YYYY-MM-DD format
  sku: string | null;
  not_property_related: boolean;
  category: string;
  account_number: string;
  payment_reference: string | null; // Made nullable
  status: 'active' | 'cancelled' | 'paused' | 'pending'; // Example statuses - ADDED 'pending'
  country: string;
  bank_account: string | null; // NEW: Bank Account field
};

export type StandingOrder = { // NEW: StandingOrder type
  id: string;
  created_at: string;
  updated_at: string;
  requester_id: string;
  payee: string;
  payment_date: string; // YYYY-MM-DD format (start date of the standing order)
  sku: string | null;
  not_property_related: boolean;
  category: string;
  account_name: string; // NEW
  account_address: string | null; // NEW, nullable
  iban_number: string | null; // NEW, nullable
  sort_code: string | null; // NEW, nullable
  account_number: string | null; // NEW, nullable
  from_day: number; // NEW, for accruals period (day of month)
  to_day: number; // NEW, for accruals period (day of month)
  payment_reference: string;
  status: 'active' | 'cancelled' | 'paused' | 'pending'; // Added 'pending' status
  country: string;
  bank_details_verified: boolean; // NEW: Bank details verified checkbox
};

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: 'requester' | 'admin' | null; // Made nullable to match profile_with_email view
  updated_at: string | null;
  user_email?: string; // Added for the profile_with_email view
  is_approved: boolean | null; // Made nullable to match profile_with_email view
  country: string | null; // New field for country
};

export type PaymentRequestAudit = {
  id: string;
  payment_request_id: string;
  changed_by_user_id: string | null;
  change_description: string;
  changed_at: string;
};

export type TransactionAudit = {
  id: string;
  transaction_id: string;
  changed_by_user_id: string | null;
  change_description: string;
  changed_at: string;
};

export type DirectDebitAudit = { // NEW: DirectDebitAudit type
  id: string;
  direct_debit_id: string;
  changed_by_user_id: string | null;
  change_description: string;
  changed_at: string;
};

export type StandingOrderAudit = { // NEW: StandingOrderAudit type
  id: string;
  standing_order_id: string;
  changed_by_user_id: string | null;
  change_description: string;
  changed_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export type Feedback = { // NEW: Feedback type
  id: string;
  feedback_types: string[];
  message: string;
  created_at: string;
  is_read: boolean;
  user_id: string | null; // User who submitted, but displayed anonymously
};