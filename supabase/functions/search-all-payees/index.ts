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

    const term = `%${searchTerm}%`;
    const searchPromises = [];

    // 1. Search Payment Requests (Supplier)
    const prQuery = supabaseClient
      .from('payment_requests')
      .select('supplier_name, supplier_address, iban_number, sort_code, account_number, bank_account_name, currency, country')
      .ilike('supplier_name', term)
      .eq('country', country)
      .limit(50);
    
    searchPromises.push(prQuery.then(({ data, error }) => {
      if (error) throw error;
      return (data || []).map(item => ({
        source_type: 'payment_request',
        name: item.supplier_name,
        address: item.supplier_address,
        iban_number: item.iban_number,
        sort_code: item.sort_code,
        account_number: item.account_number,
        bank_account_name: item.bank_account_name,
        currency: item.currency,
        country: item.country,
        bank_account: null,
      }));
    }));

    // 2. Search Standing Orders (Payee)
    const soQuery = supabaseClient
      .from('standing_orders')
      .select('payee, account_address, iban_number, sort_code, account_number, account_name, currency, country, bank_account')
      .ilike('payee', term)
      .eq('country', country)
      .limit(50);

    searchPromises.push(soQuery.then(({ data, error }) => {
      if (error) throw error;
      return (data || []).map(item => ({
        source_type: 'standing_order',
        name: item.payee,
        address: item.account_address,
        iban_number: item.iban_number,
        sort_code: item.sort_code,
        account_number: item.account_number,
        bank_account_name: item.account_name, // Use account_name for bank_account_name
        currency: item.currency,
        country: item.country,
        bank_account: item.bank_account,
      }));
    }));

    const results = await Promise.all(searchPromises);
    const combinedResults = results.flat();

    // Deduplicate results based on bank details and address within the country
    const uniqueSuggestionsMap = new Map<string, any>();
    combinedResults.forEach(item => {
      // Create a unique key based on bank details and address
      const bankDetailsKey = `${item.address || ''}-${item.iban_number || ''}-${item.sort_code || ''}-${item.account_number || ''}-${item.bank_account_name || ''}-${item.bank_account || ''}`;
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