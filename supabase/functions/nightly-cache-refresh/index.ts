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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    // @ts-ignore
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Server configuration error: Missing Supabase credentials.');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const countries = ['Switzerland', 'United Kingdom']; // Add more countries here if needed
    const results = [];

    for (const country of countries) {
      console.log(`[nightly-cache-refresh] Refreshing cache for ${country}...`);

      // Refresh landlord deposit cache
      try {
        const { data: landlordData, error: landlordError } = await supabaseClient.functions.invoke('fetch-deposit-cache', {
          body: { country },
        });
        if (landlordError) throw new Error(`Landlord cache for ${country}: ${landlordError.message}`);
        if (landlordData.error) throw new Error(`Landlord cache for ${country}: ${landlordData.error}`);
        results.push({ country, cache: 'landlord', status: 'success', message: landlordData.message });
        console.log(`[nightly-cache-refresh] Landlord cache for ${country} refreshed successfully.`);
      } catch (error) {
        results.push({ country, cache: 'landlord', status: 'error', message: error.message });
        console.error(`[nightly-cache-refresh] Error refreshing landlord cache for ${country}:`, error.message);
      }

      // Refresh customer deposit cache
      try {
        const { data: customerData, error: customerError } = await supabaseClient.functions.invoke('fetch-customer-deposit-cache', {
          body: { country },
        });
        if (customerError) throw new Error(`Customer cache for ${country}: ${customerError.message}`);
        if (customerData.error) throw new Error(`Customer cache for ${country}: ${customerData.error}`);
        results.push({ country, cache: 'customer', status: 'success', message: customerData.message });
        console.log(`[nightly-cache-refresh] Customer cache for ${country} refreshed successfully.`);
      } catch (error) {
        results.push({ country, cache: 'customer', status: 'error', message: error.message });
        console.error(`[nightly-cache-refresh] Error refreshing customer cache for ${country}:`, error.message);
      }
    }

    const hasErrors = results.some(r => r.status === 'error');

    return new Response(JSON.stringify({ 
      message: hasErrors ? 'Nightly cache refresh completed with some errors.' : 'Nightly cache refresh completed successfully.',
      results 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[nightly-cache-refresh] Unhandled error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});