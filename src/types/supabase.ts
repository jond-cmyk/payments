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
  requester_id: string; // Renamed from user_id to requester_id for consistency
  uploaded_by_user_id: string | null; // From general_transactions
  original_transaction_id: string | null; // From old transactions
  status: 'pending_input' | 'completed' | 'approved' | 'declined';
  type: string | null; // From general_transactions
  transaction_date: string; // YYYY-MM-DD format
  entry: string | null; // From general_transactions
  description: string;
  amount: number;
  bank: string | null; // From general_transactions
  contra_account: string | null; // From general_transactions
  currency: string;
  exchange_rate: number | null; // From general_transactions
  comment: string | null; // From general_transactions (notes from old transactions can map here)
  sku: string | null; // From general_transactions
  reason_for_payment: string | null; // From general_transactions
  receipt_urls: string[]; // Changed to array of strings, combining receipt_url and receipt_urls
  category: string | null; // From old transactions
  merchant_name: string | null; // From old transactions
  notes: string | null; // From old transactions, can be separate or merged with comment
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