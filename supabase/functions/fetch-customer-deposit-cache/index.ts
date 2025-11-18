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

// Helper to get department number
const getDepartmentNumberFromEntry = (entry: any): number | null => {
  const candidates = [
    entry?.departmentalDistribution?.departmentalDistributionNumber,
    entry?.department?.departmentNumber,
    entry?.departmentNumber,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number') return candidate;
    if (typeof candidate === 'string' && /^\d+$/.test(candidate)) return parseInt(candidate, 10);
  }

  const selfUrl = entry?.departmentalDistribution?.self;
  if (selfUrl && typeof selfUrl === 'string') {
    const match = selfUrl.match(/\/(\d+)$/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return null;
};

// More robust enrichment logic that merges full invoice and customer data if needed
async function enrichEntriesWithFullData(supabaseClient: any, entries: any[], country: string) {
  const enrichedEntries = [];
  for (const entry of entries) {
    let enrichedEntry = { ...entry }; // Start with a copy of the original entry

    const hasCustomerName = enrichedEntry.customer && enrichedEntry.customer.name;
    const customerNumber = enrichedEntry.customer?.customerNumber;

    // If customer name is missing but we have a customer number, fetch customer data
    if (!hasCustomerName && customerNumber) {
      try {
        const customerPath = `/customers/${customerNumber}`;
        const customerData = await fetchEconomicData(supabaseClient, customerPath, country);
        if (customerData) {
          // Merge customer data. The original entry's customer object might be sparse.
          enrichedEntry.customer = { ...customerData, ...enrichedEntry.customer };
        }
      } catch (e) {
        console.warn(`Could not enrich customer data for entry ${entry.entryNumber}: ${e.message}`);
      }
    }
    
    const hasDepartment = getDepartmentNumberFromEntry(enrichedEntry) !== null;
    const invoiceSelf = enrichedEntry.invoice?.self || enrichedEntry.bookedInvoice?.self;

    // If department is missing and we have an invoice link, fetch invoice data to get department
    if (!hasDepartment && invoiceSelf) {
      try {
        const path = new URL(invoiceSelf).pathname;
        const invoiceData = await fetchEconomicData(supabaseClient, path, country);
        // Merge invoice data. The original entry's properties will overwrite invoice's properties.
        enrichedEntry = { ...invoiceData, ...enrichedEntry };
      } catch (e) {
        console.warn(`Could not enrich department data for entry ${entry.entryNumber} from invoice: ${e.message}`);
      }
    }
    
    enrichedEntries.push(enrichedEntry);
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
        const enrichedPage = await enrichEntriesWithFullData(supabaseAdminClient, entries, country);
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

    console.log(`[fetch-customer-deposit-cache] Fetching all entries for account #${CUSTOMER_DEPOSIT_ACCOUNT_NUMBER} across ${accountingYears.length} accounting year(s).`);
    const fetchPromises = accountingYears.map(async (yearInfo: any) => {
        return fetchEntriesForYear(supabaseAdminClient, yearInfo.year, country, CUSTOMER_DEPOSIT_ACCOUNT_NUMBER);
    });

    const results = await Promise.all(fetchPromises);
    const allEntries = results.flat();
    console.log(`[fetch-customer-deposit-cache] Total entries fetched across all years: ${allEntries.length}`);

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