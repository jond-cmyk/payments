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

    // Search for payees in the standing_orders table
    const { data, error } = await supabaseClient
      .from('standing_orders')
      .select('payee, account_name, account_address, iban_number, sort_code, account_number, category, not_property_related, sku, country')
      .ilike('payee', `%${searchTerm}%`) // Dynamic search for variations
      .eq('country', country); // Filter by country

    if (error) {
      console.error('Error searching payees:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process results to get unique suggestions based on payee name and bank details
    const uniqueSuggestionsMap = new Map<string, any>();
    data.forEach(item => {
      // Create a unique key for each combination of payee and bank details
      const key = `${item.payee}-${item.account_name}-${item.account_address || ''}-${item.iban_number || ''}-${item.sort_code || ''}-${item.account_number || ''}-${item.category || ''}-${item.not_property_related || false}-${item.sku || ''}`;
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