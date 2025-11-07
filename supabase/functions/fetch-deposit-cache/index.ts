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

  console.log("[fetch-deposit-cache] Function invoked (v2: Multi-year fetch).");

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

    // --- 2. Fetch entries for the specific account across all years ---
    let allEntries: any[] = [];
    const yearPromises = accountingYears.map((yearInfo: any) => {
        const year = yearInfo.year;
        // Filter entries by the deposit account number
        const path = `/accounting-years/${year}/entries?pagesize=10000&filter=account.accountNumber$eq:${LANDLORD_DEPOSIT_ACCOUNT_NUMBER}`;
        console.log(`[fetch-deposit-cache] Fetching entries for year ${year} from: ${path}`);
        
        return supabaseAdminClient.functions.invoke("economic-api-proxy", {
            body: { path, method: "GET", country },
        }).then(({ data, error: invokeError }) => {
            if (invokeError) {
                console.warn(`[fetch-deposit-cache] Error invoking proxy for year ${year}: ${invokeError.message}`);
                return [];
            }
            const resp = data as any;
            if (resp.error || !resp.ok) {
                console.warn(`[fetch-deposit-cache] Non-OK response for year ${year}: ${resp.error || resp.status}`);
                return [];
            }
            // Extract the list of entries (assuming 'collection' or similar structure)
            return resp.data?.collection || resp.data?.items || resp.data?.results || resp.data || [];
        });
    });

    const results = await Promise.all(yearPromises);
    allEntries = results.flat();
    
    console.log(`[fetch-deposit-cache] Fetched ${allEntries.length} total entries for ${country}.`);

    // 3. Upsert into cache table
    const { error: upsertError } = await supabaseAdminClient
      .from('landlord_deposit_cache')
      .upsert({
        country: country,
        entries: allEntries,
        cached_at: new Date().toISOString(),
      }, { onConflict: 'country' });

    if (upsertError) {
      console.error('[fetch-deposit-cache] Supabase Upsert Error:', upsertError);
      throw new Error(`Failed to update cache table: ${upsertError.message}`);
    }

    console.log(`[fetch-deposit-cache] Cache updated successfully for ${country}.`);

    return new Response(JSON.stringify({ message: `Cache updated successfully for ${country}. Fetched ${allEntries.length} entries.` }), {
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