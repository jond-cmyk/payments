// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LANDLORD_DEPOSIT_ACCOUNT_NUMBER = 5201;

// Helper to invoke the economic-api-proxy
async function fetchEconomicData(supabaseClient: any, path: string, country: string) {
    const { data, error: invokeError } = await supabaseClient.functions.invoke("economic-api-proxy", {
        body: { path, method: "GET", country },
    });

    if (invokeError) throw new Error(invokeError.message);
    const resp = data as any;

    if (resp.error || !resp.ok) {
        throw new Error(resp.error || `e-conomic API returned status ${resp.status}`);
    }
    return resp.data;
}

// @ts-ignore
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[fetch-deposit-cache] Function invoked.");

  try {
    // Use Service Role Key for database operations
    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    // @ts-ignore
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Server configuration error: Missing Supabase credentials.');
    }

    const supabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
    
    const payload = await req.json();
    const { country } = payload;

    if (!country) {
      return new Response(JSON.stringify({ error: 'Country is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch data from e-conomic
    const path = `/account-ledger-entries/${LANDLORD_DEPOSIT_ACCOUNT_NUMBER}?pagesize=10000`;
    console.log(`[fetch-deposit-cache] Fetching data for ${country} from: ${path}`);
    
    const economicData = await fetchEconomicData(supabaseAdminClient, path, country);
    
    // Extract the list of entries (assuming 'collection' or similar structure)
    const entries = economicData?.collection || economicData?.items || economicData?.results || economicData;
    
    if (!Array.isArray(entries)) {
        console.error("[fetch-deposit-cache] Failed to extract array from economic response:", economicData);
        throw new Error("Failed to parse ledger entries from e-conomic response.");
    }

    console.log(`[fetch-deposit-cache] Fetched ${entries.length} entries for ${country}.`);

    // 2. Upsert into cache table
    const { error: upsertError } = await supabaseAdminClient
      .from('landlord_deposit_cache')
      .upsert({
        country: country,
        entries: entries,
        cached_at: new Date().toISOString(),
      }, { onConflict: 'country' });

    if (upsertError) {
      console.error('[fetch-deposit-cache] Supabase Upsert Error:', upsertError);
      throw new Error(`Failed to update cache table: ${upsertError.message}`);
    }

    console.log(`[fetch-deposit-cache] Cache updated successfully for ${country}.`);

    return new Response(JSON.stringify({ message: `Cache updated successfully for ${country}. Fetched ${entries.length} entries.` }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[fetch-deposit-cache] Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});