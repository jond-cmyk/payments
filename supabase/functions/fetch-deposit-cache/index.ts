// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LANDLORD_DEPOSIT_ACCOUNT_NUMBER = 5201;

// Helper to invoke the economic-api-proxy and handle its wrapped response
async function fetchEconomicData(supabaseClient: any, path: string, country: string) {
    const { data, error: invokeError } = await supabaseClient.functions.invoke("economic-api-proxy", {
        body: { path, method: "GET", country },
    });

    if (invokeError) {
        console.error(`[fetchEconomicData] Proxy invocation failed for ${path}:`, invokeError);
        throw new Error(`Proxy invocation failed: ${invokeError.message}`);
    }
    
    const resp = data as any;

    if (resp.error || !resp.ok) {
        // Throw the specific error returned by the proxy, including the status code if available
        const status = resp.status ? ` (Status ${resp.status})` : '';
        const message = resp.error || `e-conomic API returned status ${resp.status}`;
        console.error(`[fetchEconomicData] e-conomic API Error for ${path}: ${message}${status}`);
        throw new Error(message + status);
    }
    return resp.data;
}

// @ts-ignore
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[fetch-deposit-cache] Function invoked (v4: Robust Diagnostic fetch).");

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

    // --- 1. Fetch all accounting years ---
    const yearsData = await fetchEconomicData(supabaseAdminClient, "/accounting-years", country);
    const accountingYears = yearsData?.collection || [];
    
    if (!accountingYears || accountingYears.length === 0) {
        throw new Error("No accounting years found in e-conomic. Cannot fetch entries.");
    }
    
    // Sort years to get the latest one
    const latestYear = accountingYears.sort((a: any, b: any) => b.year.localeCompare(a.year))[0].year;

    // --- 2. Fetch entries for the latest year WITHOUT account filter (Diagnostic) ---
    const path = `/accounting-years/${latestYear}/entries?pagesize=10`; // Limit to 10 for quick test
    console.log(`[fetch-deposit-cache] DIAGNOSTIC: Fetching 10 entries from latest year (${latestYear}) without account filter: ${path}`);
    
    const economicData = await fetchEconomicData(supabaseAdminClient, path, country);
    
    const entries = economicData?.collection || economicData?.items || economicData?.results || economicData;
    
    if (!Array.isArray(entries)) {
        console.error("[fetch-deposit-cache] DIAGNOSTIC: Failed to extract array from economic response:", economicData);
        throw new Error("Failed to parse ledger entries from e-conomic response.");
    }

    console.log(`[fetch-deposit-cache] DIAGNOSTIC: Fetched ${entries.length} entries. First entry: ${JSON.stringify(entries[0])}`);

    // 3. Upsert the diagnostic data (or empty array) into cache table
    const { error: upsertError } = await supabaseAdminClient
      .from('landlord_deposit_cache')
      .upsert({
        country: country,
        entries: entries, // Cache the diagnostic entries
        cached_at: new Date().toISOString(),
      }, { onConflict: 'country' });

    if (upsertError) {
      console.error('[fetch-deposit-cache] Supabase Upsert Error:', upsertError);
      throw new Error(`Failed to update cache table: ${upsertError.message}`);
    }

    console.log(`[fetch-deposit-cache] DIAGNOSTIC CACHE UPDATED. Check the Landlord Deposits page for the first 10 entries.`);

    return new Response(JSON.stringify({ message: `Diagnostic cache updated successfully for ${country}. Fetched ${entries.length} entries from latest year (no filter).` }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[fetch-deposit-cache] Edge Function Error:', error);
    // Return 200 with error payload so the client can read the message
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});