// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// @ts-ignore
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // @ts-ignore
    const supabaseClient = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
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
        name: item.supplier_name || '', // Ensure string
        address: item.supplier_address || null,
        iban_number: item.iban_number || null,
        sort_code: item.sort_code || null,
        account_number: item.account_number || null,
        bank_account_name: item.bank_account_name || null,
        currency: item.currency || null,
        country: item.country,
        bank_account: null,
        payment_reference: null,
      }));
    }));

    // 2. Search Standing Orders (Payee)
    const soQuery = supabaseClient
      .from('standing_orders')
      .select('payee, account_address, iban_number, sort_code, account_number, account_name, currency, country, bank_account, payment_reference')
      .ilike('payee', term)
      .eq('country', country)
      .limit(50);

    searchPromises.push(soQuery.then(({ data, error }) => {
      if (error) throw error;
      return (data || []).map(item => ({
        source_type: 'standing_order',
        name: item.payee || '', // Ensure string
        address: item.account_address || null,
        iban_number: item.iban_number || null,
        sort_code: item.sort_code || null,
        account_number: item.account_number || null,
        bank_account_name: item.account_name || null, // Use account_name for bank_account_name
        currency: item.currency || null,
        country: item.country,
        bank_account: item.bank_account || null,
        payment_reference: item.payment_reference || null,
      }));
    }));

    // 3. Search Direct Debits (Payee)
    const ddQuery = supabaseClient
      .from('direct_debits')
      .select('payee, account_number, payment_reference, currency, country, bank_account')
      .ilike('payee', term)
      .eq('country', country)
      .limit(50);

    searchPromises.push(ddQuery.then(({ data, error }) => {
      if (error) throw error;
      return (data || []).map(item => ({
        source_type: 'direct_debit',
        name: item.payee || '', // Ensure string
        address: null,
        iban_number: null,
        sort_code: null,
        account_number: item.account_number || null,
        bank_account_name: null,
        currency: item.currency || null,
        country: item.country,
        bank_account: item.bank_account || null,
        payment_reference: item.payment_reference || null,
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
    // Return a 200 status with an error payload to prevent client-side fetch error, 
    // allowing the client to handle the error gracefully via the `data?.error` check.
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred in the Edge Function.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});