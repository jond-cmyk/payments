export type PaymentRequest = {
  id: string;
  requester_id: string;
  supplier_name: string;
  sku_number: string;
  supplier_address: string;
  iban_number: string;
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
};

export type Transaction = {
  id: string;
  user_id: string;
  original_transaction_id: string | null;
  transaction_date: string; // YYYY-MM-DD format
  description: string;
  amount: number;
  currency: string;
  status: 'pending_input' | 'completed' | 'approved' | 'declined';
  category: string | null;
  merchant_name: string | null;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
  updated_at: string;
};

export type GeneralTransaction = {
  id: string;
  requester_id: string;
  uploaded_by_user_id: string | null;
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
  sku: string | null; // Nullable for requester to fill
  reason_for_payment: string | null; // Nullable for requester to fill, dropdown in UI
  receipt_urls: string[]; // Array for multiple document URLs
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: 'requester' | 'admin';
  updated_at: string | null;
  user_email?: string; // Added for the profile_with_email view
  is_approved: boolean; // New field for manual approval
};

export type PaymentRequestAudit = {
  id: string;
  payment_request_id: string;
  changed_by_user_id: string | null;
  change_description: string;
  changed_at: string;
};