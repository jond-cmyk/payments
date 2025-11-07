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
    const payload = { path, method: "GET", country };
    console.log(`[fetchEconomicData] Invoking proxy with payload: ${JSON.stringify(payload)}`);
    const { data, error: invokeError } = await supabaseClient.functions.invoke("economic-api-proxy", {
        body: payload,
    });

    if (invokeError) {
        console.error(`[fetchEconomicData] Proxy invocation failed for ${path}:`, invokeError);
        throw new Error(`Proxy invocation failed: ${invokeError.message}`);
    }
    
    const resp = data as any;

    if (resp.error || !resp.ok) {
        const status = resp.status ? ` (Status ${resp.status})` : '';
        const message = resp.error || `e-conomic API returned status ${resp.status}`;
        console.error(`[fetchEconomicData] e-conomic API Error for ${path}: ${message}${status}`);
        throw new Error(message + status);
    }
    return resp.data;
}

// Helper to fetch entries from e-conomic for a specific year and filter
async function fetchEntriesForYear(supabaseAdminClient: any, year: string, country: string, filter?: string) {
    let allEntries: any[] = [];
    let currentPage = 0;
    const pageSize = 1000; 

    while (true) {
        // Use the specific account/year entries path.
        let path = `/accounts/${LANDLORD_DEPOSIT_ACCOUNT_NUMBER}/accounting-years/${year}/entries?pagesize=${pageSize}&skipPages=${currentPage}`;
        if (filter) {
            // Note: The proxy handles encoding the filter string
            path += `&filter=${filter}`;
        }
        
        const economicData = await fetchEconomicData(supabaseAdminClient, path, country);
        
        // Extract list from response (handles various formats like .collection, .items, etc.)
        const entries = economicData?.collection || economicData?.items || economicData?.results || economicData;
        
        if (!Array.isArray(entries)) break;

        allEntries = allEntries.concat(entries);

        const pagination = economicData?.pagination;
        const totalResults = pagination?.results || 0;
        const totalPages = Math.ceil(totalResults / pageSize);

        if (currentPage + 1 >= totalPages || entries.length === 0) break;
        currentPage++;
    }
    return allEntries;
}

// @ts-ignore
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[fetch-deposit-cache] Function invoked (v11: Unfiltered historical fetch on static cache init).");

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

    // Calculate 90 days ago date string (YYYY-MM-DD)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];
    
    // --- 1. Fetch all accounting years ---
    const yearsData = await fetchEconomicData(supabaseAdminClient, "/accounting-years", country);
    const accountingYears = yearsData?.collection || [];
    
    if (!accountingYears || accountingYears.length === 0) {
        throw new Error("No accounting years found in e-conomic.");
    }
    
    // --- 2. Check/Populate Static Cache (Historical Data: OLDER than 90 days) ---
    const { data: staticCache, error: staticCacheError } = await supabaseAdminClient
        .from('landlord_deposit_static_cache')
        .select('entries')
        .eq('country', country)
        .single();

    let staticEntries: any[] = [];
    let staticCacheNeedsUpdate = false;

    if (staticCacheError && staticCacheError.code === 'PGRST116') {
        // Static cache is empty, perform initial historical fetch (ALL history)
        console.log("[fetch-deposit-cache] Static cache empty. Performing initial historical fetch (ALL history, unfiltered).");
        staticCacheNeedsUpdate = true;
        
        const historicalFetchPromises = accountingYears.map(async (yearInfo: any) => {
            // Fetch ALL entries for the year (no date filter applied here)
            return fetchEntriesForYear(supabaseAdminClient, yearInfo.year, country);
        });

        const historicalResults = await Promise.all(historicalFetchPromises);
        const allHistoricalEntries = historicalResults.flat();
        
        // Filter entries locally to be older than 90 days before saving to static cache
        staticEntries = allHistoricalEntries.filter((entry: any) => {
            try {
                const entryDate = new Date(entry.date);
                return entryDate.toISOString().split('T')[0] < ninetyDaysAgoStr;
            } catch {
                return false; // Skip entries with invalid dates
            }
        });
        
        // Update static cache
        const { error: upsertStaticError } = await supabaseAdminClient
            .from('landlord_deposit_static_cache')
            .upsert({
                country: country,
                entries: staticEntries,
                cached_at: new Date().toISOString(),
            }, { onConflict: 'country' });

        if (upsertStaticError) {
            console.error('[fetch-deposit-cache] Static Cache Upsert Error:', upsertStaticError);
            // Continue even if static cache update fails, using the fetched data
        }
        console.log(`[fetch-deposit-cache] Static cache initialized with ${staticEntries.length} historical entries.`);

    } else if (staticCache) {
        staticEntries = staticCache.entries || [];
        console.log(`[fetch-deposit-cache] Using existing static cache with ${staticEntries.length} entries.`);
    }

    // --- 3. Fetch Dynamic Entries (Recent Data: NEWER than 90 days) ---
    console.log("[fetch-deposit-cache] Fetching dynamic entries (last 90 days).");
    
    const dynamicFetchPromises = accountingYears.map(async (yearInfo: any) => {
        // Filter for entries newer than or equal to 90 days ago
        const filter = `date$gte:${ninetyDaysAgoStr}`;
        return fetchEntriesForYear(supabaseAdminClient, yearInfo.year, country, filter);
    });

    const dynamicResults = await Promise.all(dynamicFetchPromises);
    const dynamicEntries = dynamicResults.flat();
    console.log(`[fetch-deposit-cache] Fetched ${dynamicEntries.length} dynamic entries.`);

    // --- 4. Merge Static and Dynamic Entries ---
    // Use a Map to deduplicate based on entryNumber (assuming entryNumber is unique across years)
    const combinedEntriesMap = new Map();

    // Add static entries first
    staticEntries.forEach(entry => {
        if (entry.entryNumber) {
            combinedEntriesMap.set(entry.entryNumber, entry);
        }
    });

    // Add dynamic entries, overwriting static entries if they overlap (which they shouldn't, but ensures freshness)
    dynamicEntries.forEach(entry => {
        if (entry.entryNumber) {
            combinedEntriesMap.set(entry.entryNumber, entry);
        }
    });

    const finalEntries = Array.from(combinedEntriesMap.values());
    console.log(`[fetch-deposit-cache] Final combined entries count: ${finalEntries.length}`);

    // --- 5. Upsert the final combined data into the main cache table ---
    const { error: upsertMainError } = await supabaseAdminClient
      .from('landlord_deposit_cache')
      .upsert({
        country: country,
        entries: finalEntries, // Cache the full list
        cached_at: new Date().toISOString(),
      }, { onConflict: 'country' });

    if (upsertMainError) {
      console.error('[fetch-deposit-cache] Main Cache Upsert Error:', upsertMainError);
      throw new Error(`Failed to update main cache table: ${upsertMainError.message}`);
    }

    console.log(`[fetch-deposit-cache] FULL CACHE UPDATED successfully for ${country}. Total entries: ${finalEntries.length}`);

    return new Response(JSON.stringify({ message: `Cache updated successfully for ${country}. Total entries: ${finalEntries.length}.` }), {
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