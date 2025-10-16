// ... existing code ...
export type StandingOrder = { // NEW: StandingOrder type
  id: string;
  created_at: string;
  updated_at: string;
  requester_id: string;
  payee: string;
  payment_date: string; // YYYY-MM-DD format (start date of the standing order)
  payment_end_date?: string | null; // NEW: optional end date
  sku: string | null;
  not_property_related: boolean;
  categories: { category: string; amount: number; }[]; // Changed to array of objects
  account_name: string;
  account_address: string | null;
  iban_number: string | null;
  sort_code: string | null;
  account_number: string | null;
  from_day: number; // NEW, for accruals period (day of month)
  to_day: number; // NEW, for accruals period (day of month)
  payment_reference: string;
  comments?: string | null; // NEW: free-text comments
  status: 'active' | 'cancelled' | 'paused' | 'pending' | 'awaiting_info'; // Added 'pending' status and 'awaiting_info'
  country: string;
  bank_details_verified: boolean; // NEW: Bank details verified checkbox
  total_amount: number; // NEW: Total amount for the standing order
  payment_day?: number | null; // NEW: Made nullable to match database schema
};

export type Profile = {
// ... existing code ...