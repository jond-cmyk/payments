// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// @ts-ignore
import { isWithinInterval, parseISO } from 'https://esm.sh/date-fns@3.6.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CUSTOMER_DEPOSIT_ACCOUNT_NUMBER = 8201;

// Helper to invoke the economic-api-proxy and handle its wrapped response
async function fetchEconomicData(supabaseClient: any, path: string, country: string) {
    const payload = { path, method: "GET", country };
    const { data, error: invokeError } = await supabaseClient.functions.invoke("economic-api-proxy", {
        body: payload,
    });

    if (invokeError) {
        throw new Error(`Proxy invocation failed: ${invokeError.message}`);
    }
    
    const resp = data as any;

    if (resp.error || !resp.ok) {
        const status = resp.status ? ` (Status ${resp.status})` : '';
        const message = resp.error || `e-conomic API returned status ${resp.status}`;
        throw new Error(message + status);
    }
    return resp.data;
}

// Helper to extract list from various response shapes
const extractList = (payload: any): any[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "object" && payload !== null) {
    const keys = ['collection', 'items', 'results', 'entries'];
    for (const key of keys) {
      if (Array.isArray(payload[key])) return payload[key];
    }
  }
  return [];
};

// "Slow but working" enrichment logic that is more reliable
async function enrichEntriesWithCustomerData(supabaseClient: any, entries: any[], country: string) {
  const enrichedEntries = [];
  for (const entry of entries) {
    if (entry.customer && entry.customer.name) {
      enrichedEntries.push(entry);
      continue;
    }

    const invoiceSelf = entry.invoice?.self || entry.bookedInvoice?.self;
    if (invoiceSelf) {
      try {
        const path = new URL(invoiceSelf).pathname;
        const invoiceData = await fetchEconomicData(supabaseClient, path, country);
        if (invoiceData && invoiceData.customer) {
          enrichedEntries.push({ ...entry, customer: invoiceData.customer });
        } else {
          enrichedEntries.push(entry);
        }
      } catch (e) {
        console.warn(`Could not enrich entry ${entry.entryNumber} from invoice: ${e.message}`);
        enrichedEntries.push(entry);
      }
    } else {
      enrichedEntries.push(entry);
    }
  }
  return enrichedEntries;
}

// Helper to fetch all entries for a specific account and year, with pagination
async function fetchEntriesForYear(supabaseAdminClient: any, year: string, country: string, accountNumber: number) {
    let allEntries: any[] = [];
    let currentPage = 0;
    const pageSize = 1000; 

    while (true) {
        const path = `/accounts/${accountNumber}/accounting-years/${year}/entries?pagesize=${pageSize}&skipPages=${currentPage}`;
        
        const economicData = await fetchEconomicData(supabaseAdminClient, path, country);
        const entries = extractList(economicData);
        
        if (!entries || entries.length === 0) {
            break;
        }

        // Use the more reliable enrichment logic
        const enrichedPage = await enrichEntriesWithCustomerData(supabaseAdminClient, entries, country);
        allEntries = allEntries.concat(enrichedPage);

        if (entries.length < pageSize) {
            break;
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

    const yearsData = await fetchEconomicData(supabaseAdminClient, "/accounting-years", country);
    const accountingYears = extractList(yearsData);
    
    if (!accountingYears || accountingYears.length === 0) {
        throw new Error("No accounting years found in e-conomic.");
    }

    // Find only the current accounting year to speed up the process
    const today = new Date();
    const currentYearObject = accountingYears.find((y: any) => {
        const from = y.fromDate ? parseISO(y.fromDate) : null;
        const to = y.toDate ? parseISO(y.toDate) : null;
        return from && to && isWithinInterval(today, { start: from, end: to });
    });

    if (!currentYearObject || !currentYearObject.year) {
        throw new Error("Could not determine the current accounting year from e-conomic.");
    }

    console.log(`[fetch-customer-deposit-cache] Found current accounting year: ${currentYearObject.year}`);

    // Fetch entries ONLY for the current year
    const allEntries = await fetchEntriesForYear(supabaseAdminClient, currentYearObject.year, country, CUSTOMER_DEPOSIT_ACCOUNT_NUMBER);

    const { error: upsertError } = await supabaseAdminClient
      .from('customer_deposit_cache')
      .upsert({
        country: country,
        entries: allEntries,
        cached_at: new Date().toISOString(),
      }, { onConflict: 'country' });

    if (upsertError) {
      throw new Error(`Failed to update cache table: ${upsertError.message}`);
    }

    return new Response(JSON.stringify({ message: `Cache updated successfully for ${country}. Total entries: ${allEntries.length}.` }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});