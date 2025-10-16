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
        auth: { persistSession: false },
      }
    );

    const { searchTerm, country } = await req.json();

    if (!searchTerm || !country) {
      return new Response(JSON.stringify({ error: 'Search term and country are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Search for payees in the standing_orders table
    // IMPORTANT: select categories (plural) and total_amount (not category)
    const { data, error } = await supabaseClient
      .from('standing_orders')
      .select('payee, account_name, account_address, iban_number, sort_code, account_number, not_property_related, sku, country, currency, bank_account, categories, total_amount')
      .ilike('payee', `%${searchTerm}%`)
      .eq('country', country)
      .limit(50);

    if (error) {
      console.error('Error searching payees:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process results to get unique suggestions based on bank details only
    const uniqueSuggestionsMap = new Map<string, any>();
    (data || []).forEach((item) => {
      // Create a unique key based on bank details (and account name)
      // Excluding payee/category/sku from key so same bank details dedupe properly
      const bankDetailsKey = `${item.account_name || ''}-${item.account_address || ''}-${item.iban_number || ''}-${item.sort_code || ''}-${item.account_number || ''}-${item.currency || ''}-${item.bank_account || ''}`;

      if (!uniqueSuggestionsMap.has(bankDetailsKey)) {
        uniqueSuggestionsMap.set(bankDetailsKey, item);
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