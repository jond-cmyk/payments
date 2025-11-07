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

  console.log("[fetch-deposit-cache] Function invoked (v5: Full Deposit Ledger Fetch).");

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

    // --- 2. Fetch entries for the latest year WITH account filter ---
    // Fetch all pages for the specific account and latest year
    let allEntries: any[] = [];
    let currentPage = 0;
    const pageSize = 1000; // Max page size

    while (true) {
        // Use the specific account ledger entries path
        const path = `/accounts/${LANDLORD_DEPOSIT_ACCOUNT_NUMBER}/accounting-years/${latestYear}/entries?pagesize=${pageSize}&skipPages=${currentPage}`;
        console.log(`[fetch-deposit-cache] Fetching page ${currentPage} for year ${latestYear}: ${path}`);
        
        const economicData = await fetchEconomicData(supabaseAdminClient, path, country);
        
        // Extract list from response (handles various formats like .collection, .items, etc.)
        const entries = economicData?.collection || economicData?.items || economicData?.results || economicData;
        
        if (!Array.isArray(entries)) {
            console.error("[fetch-deposit-cache] Failed to extract array from economic response:", economicData);
            // If the first page fails to return an array, it might be a permission issue or 404.
            if (currentPage === 0) {
                throw new Error("Failed to parse ledger entries from e-conomic response. Check if the account number is valid or if the API key has access to ledger entries.");
            }
            // If subsequent pages fail, break the loop.
            break;
        }

        allEntries = allEntries.concat(entries);

        const pagination = economicData?.pagination;
        const totalResults = pagination?.results || 0;
        const totalPages = Math.ceil(totalResults / pageSize);

        if (currentPage + 1 >= totalPages || entries.length === 0) {
            break;
        }
        currentPage++;
    }

    console.log(`[fetch-deposit-cache] Successfully fetched ${allEntries.length} entries for account ${LANDLORD_DEPOSIT_ACCOUNT_NUMBER} in year ${latestYear}.`);

    // 3. Upsert the full data into cache table
    const { error: upsertError } = await supabaseAdminClient
      .from('landlord_deposit_cache')
      .upsert({
        country: country,
        entries: allEntries, // Cache the full list
        cached_at: new Date().toISOString(),
      }, { onConflict: 'country' });

    if (upsertError) {
      console.error('[fetch-deposit-cache] Supabase Upsert Error:', upsertError);
      throw new Error(`Failed to update cache table: ${upsertError.message}`);
    }

    console.log(`[fetch-deposit-cache] FULL CACHE UPDATED successfully for ${country}. Total entries: ${allEntries.length}`);

    return new Response(JSON.stringify({ message: `Cache updated successfully for ${country}. Total entries: ${allEntries.length}.` }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[fetch-deposit-cache] Edge Function Error:', error);
    // Return 200 with error payload so the client can read the message
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});