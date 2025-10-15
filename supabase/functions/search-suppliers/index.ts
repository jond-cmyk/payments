import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const { searchTerm, country } = await req.json();

    if (!searchTerm || !country) {
      return new Response(JSON.stringify({ error: 'Search term and country are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Search for suppliers in the payment_requests table
    const { data, error } = await supabaseClient
      .from('payment_requests')
      .select('supplier_name, supplier_address, iban_number, sort_code, account_number, bank_account_name, currency, payment_amount, reason_for_payment, category, not_sku_related, sku_number, lease_id, country')
      .ilike('supplier_name', `%${searchTerm}%`) // Dynamic search for variations
      .eq('country', country); // Filter by country

    if (error) {
      console.error('Error searching suppliers:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process results to get unique suggestions based on supplier name and bank details
    const uniqueSuggestionsMap = new Map<string, any>();
    data.forEach(item => {
      // Create a unique key for each combination of supplier and bank details
      const key = `${item.supplier_name}-${item.supplier_address}-${item.iban_number || ''}-${item.sort_code || ''}-${item.account_number || ''}-${item.bank_account_name || ''}-${item.currency || ''}-${item.payment_amount || ''}-${item.reason_for_payment || ''}-${item.category || ''}-${item.not_sku_related || false}-${item.sku_number || ''}-${item.lease_id || ''}`;
      if (!uniqueSuggestionsMap.has(key)) {
        uniqueSuggestionsMap.set(key, item);
      }
    });

    const suggestions = Array.from(uniqueSuggestionsMap.values());

    return new Response(JSON.stringify({ suggestions }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Edge Function unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});