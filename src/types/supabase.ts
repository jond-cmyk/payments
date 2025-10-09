export type PaymentRequest = {
  id: string;
  requester_id: string;
  supplier_name: string;
  sku_number: string;
  supplier_address: string;
  iban_number: string;
  reason_for_payment: string;
  date_payment_required: string; // YYYY-MM-DD format
  invoice_pdf_url: string;
  status: 'pending' | 'setup' | 'approved' | 'declined';
  admin_action_by: string | null;
  admin_action_reason: string | null;
  receipt_pdf_url: string | null;
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
};

export type PaymentRequestAudit = {
  id: string;
  payment_request_id: string;
  changed_by_user_id: string | null;
  change_description: string;
  changed_at: string;
};