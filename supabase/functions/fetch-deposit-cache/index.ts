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

// Robust helper to fetch all entries for a specific account and year, with pagination
async function fetchEntriesForYear(supabaseAdminClient: any, year: string, country: string, filter?: string) {
    let allEntries: any[] = [];
    let currentPage = 0;
    const pageSize = 1000; 

    while (true) {
        let path = `/accounts/${LANDLORD_DEPOSIT_ACCOUNT_NUMBER}/accounting-years/${year}/entries?pagesize=${pageSize}&skipPages=${currentPage}`;
        if (filter) {
            path += `&filter=${filter}`;
        }
        
        const economicData = await fetchEconomicData(supabaseAdminClient, path, country);
        
        const entries = economicData?.collection || economicData?.items || economicData?.results || economicData;
        
        if (!Array.isArray(entries) || entries.length === 0) {
            break; // No more entries to fetch for this year
        }

        allEntries = allEntries.concat(entries);

        if (entries.length < pageSize) {
            break; // This was the last page for this year
        }

        currentPage++;
    }
    return allEntries;
}

// @ts-ignore
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[fetch-deposit-cache] Function invoked (v13: Robust year-by-year fetch).");

  try {
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

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];
    
    const { data: staticCache, error: staticCacheError } = await supabaseAdminClient
        .from('landlord_deposit_static_cache')
        .select('entries')
        .eq('country', country)
        .single();

    let staticEntries: any[] = [];

    // --- 1. Fetch all accounting years ---
    const yearsData = await fetchEconomicData(supabaseAdminClient, "/accounting-years", country);
    const accountingYears = yearsData?.collection || [];
    
    if (!accountingYears || accountingYears.length === 0) {
        throw new Error("No accounting years found in e-conomic.");
    }

    if (staticCacheError && staticCacheError.code === 'PGRST116') {
        console.log("[fetch-deposit-cache] Static cache empty. Performing initial historical fetch (unfiltered, year-by-year).");
        
        const historicalFetchPromises = accountingYears.map(async (yearInfo: any) => {
            return fetchEntriesForYear(supabaseAdminClient, yearInfo.year, country);
        });

        const historicalResults = await Promise.all(historicalFetchPromises);
        const allHistoricalEntries = historicalResults.flat();
        
        staticEntries = allHistoricalEntries.filter((entry: any) => {
            try {
                const entryDate = new Date(entry.date);
                return entryDate.toISOString().split('T')[0] < ninetyDaysAgoStr;
            } catch { return false; }
        });
        
        const { error: upsertStaticError } = await supabaseAdminClient
            .from('landlord_deposit_static_cache')
            .upsert({
                country: country,
                entries: staticEntries,
                cached_at: new Date().toISOString(),
            }, { onConflict: 'country' });

        if (upsertStaticError) {
            console.error('[fetch-deposit-cache] Static Cache Upsert Error:', upsertStaticError);
        }
        console.log(`[fetch-deposit-cache] Static cache initialized with ${staticEntries.length} historical entries.`);

    } else if (staticCache) {
        staticEntries = staticCache.entries || [];
        console.log(`[fetch-deposit-cache] Using existing static cache with ${staticEntries.length} entries.`);
    }

    console.log("[fetch-deposit-cache] Fetching dynamic entries (last 90 days).");
    const dynamicFilter = `date$gte:${ninetyDaysAgoStr}`;
    
    const dynamicFetchPromises = accountingYears.map(async (yearInfo: any) => {
        return fetchEntriesForYear(supabaseAdminClient, yearInfo.year, country, dynamicFilter);
    });

    const dynamicResults = await Promise.all(dynamicFetchPromises);
    const dynamicEntries = dynamicResults.flat();
    console.log(`[fetch-deposit-cache] Fetched ${dynamicEntries.length} dynamic entries.`);

    const combinedEntriesMap = new Map();
    staticEntries.forEach(entry => {
        if (entry.entryNumber) combinedEntriesMap.set(entry.entryNumber, entry);
    });
    dynamicEntries.forEach(entry => {
        if (entry.entryNumber) combinedEntriesMap.set(entry.entryNumber, entry);
    });

    const finalEntries = Array.from(combinedEntriesMap.values());
    console.log(`[fetch-deposit-cache] Final combined entries count: ${finalEntries.length}`);

    const { error: upsertMainError } = await supabaseAdminClient
      .from('landlord_deposit_cache')
      .upsert({
        country: country,
        entries: finalEntries,
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
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});