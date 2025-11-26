-- Add permissions column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions JSONB;

-- Backfill permissions for existing ADMINS (Give all permissions)
UPDATE public.profiles
SET permissions = '{
  "sales": {
    "customers": true,
    "customer_deposits": true,
    "customer_deposit_returns": true,
    "landlord_deposits": true,
    "deposit_return_advisement": true,
    "property_pnl": true
  },
  "support": {
    "dashboard": true,
    "new_request": true,
    "all_requests": true,
    "missing_receipts": true,
    "completed_receipts": true,
    "direct_debits": true,
    "standing_orders": true
  },
  "admin": {
    "statistics": true,
    "admin_panel": true
  }
}'::jsonb
WHERE role = 'admin';

-- Backfill permissions for existing REQUESTERS (Give Support + Sales permissions, exclude Admin)
UPDATE public.profiles
SET permissions = '{
  "sales": {
    "customers": true,
    "customer_deposits": true,
    "customer_deposit_returns": true,
    "landlord_deposits": true,
    "deposit_return_advisement": true,
    "property_pnl": true
  },
  "support": {
    "dashboard": true,
    "new_request": true,
    "all_requests": true,
    "missing_receipts": true,
    "completed_receipts": true,
    "direct_debits": true,
    "standing_orders": true
  },
  "admin": {
    "statistics": false,
    "admin_panel": false
  }
}'::jsonb
WHERE role = 'requester';

-- Update the profile_with_email view to include the new column
CREATE OR REPLACE VIEW public.profile_with_email AS
SELECT 
    p.id,
    p.first_name,
    p.last_name,
    p.avatar_url,
    p.role,
    p.updated_at,
    p.is_approved,
    p.country,
    p.permissions, -- Added
    au.email AS user_email,
    au.last_sign_in_at
FROM 
    public.profiles p
JOIN 
    auth.users au ON p.id = au.id;