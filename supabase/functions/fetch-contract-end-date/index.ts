// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { sku } = await req.json()

    if (!sku) {
      return new Response(JSON.stringify({ error: 'SKU is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- TEST MODE ---
    if (sku.toUpperCase() === 'TEST') {
      const mockDate = new Date();
      mockDate.setFullYear(mockDate.getFullYear() + 1);
      return new Response(JSON.stringify({ 
        endDate: mockDate.toISOString().split('T')[0], 
        message: "Test mode: Simulated date returned." 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- CREDENTIALS CHECK ---
    // @ts-ignore
    const adminCookie = Deno.env.get('KASSOE_ADMIN_COOKIE');
    
    if (!adminCookie) {
      return new Response(JSON.stringify({ 
        endDate: null, 
        message: "Missing 'KASSOE_ADMIN_COOKIE' secret. Please add your portal session cookie to Supabase Secrets." 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const headers = {
      'Cookie': adminCookie, // Pass the session cookie
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    console.log(`[fetch-contract-end-date] 1. Searching for SKU: ${sku} in category 367...`);

    // 1. SEARCH STEP
    // We assume the filter parameter structure based on typical admin panels.
    // The user mentioned searching in the 'SKU' field.
    // Common pattern: ?Filter[sku]=VALUE or ?filter=VALUE
    // We'll try a flexible search on the specific category page 367
    const searchUrl = `https://portal.kassoehousing.com/admin/kassoe-theme/categories/edit/367?Filter[KassoeThemeProducts][sku]=${encodeURIComponent(sku)}`;
    
    const searchRes = await fetch(searchUrl, { headers });
    
    if (!searchRes.ok) {
        throw new Error(`Failed to search portal. Status: ${searchRes.status}`);
    }
    
    const searchHtml = await searchRes.text();

    // 2. PARSE ID STEP
    // Look for a link like "/admin/kassoe-theme/products/edit/5987" inside the search results
    // Regex explanation: Look for href containing products/edit/ digits
    const productLinkMatch = searchHtml.match(/href="[^"]*\/products\/edit\/(\d+)"/);
    
    if (!productLinkMatch) {
        console.log(`[fetch-contract-end-date] Product ID not found in search results for ${sku}.`);
        // Debug: Log a snippet to see what we got back (could be a login page redirection if cookie is invalid)
        if (searchHtml.includes("login") || searchHtml.includes("Login")) {
             return new Response(JSON.stringify({ 
                endDate: null, 
                message: "Authentication failed. Your KASSOE_ADMIN_COOKIE may be expired. Please update it." 
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Could not find product ID for SKU ${sku}. Check if SKU exists in category 367.` 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const productId = productLinkMatch[1];
    console.log(`[fetch-contract-end-date] 2. Found Product ID: ${productId}. Fetching details...`);

    // 3. FETCH DETAILS STEP
    const editUrl = `https://portal.kassoehousing.com/admin/kassoe-theme/products/edit/${productId}`;
    const editRes = await fetch(editUrl, { headers });
    const editHtml = await editRes.text();

    // 4. PARSE DATE STEP
    // Look for the Agreement End Date input field.
    // We assume the field name might be 'contract_end_date' or similar based on typical naming.
    // We look for a date pattern YYYY-MM-DD inside a value attribute.
    
    // Pattern 1: specific field name if known (user didn't specify exact field name, assuming standard)
    // Attempting to find a date value associated with "Agreement End Date" label or similar input
    
    // Regex to find a date value: value="2025-10-31"
    // We try to be specific to the contract end field.
    // Adjust 'contract_end_date' below if the actual field name differs in the HTML source.
    const dateMatch = editHtml.match(/name="[^"]*contract_end_date[^"]*"\s+value="(\d{4}-\d{2}-\d{2})"/i) 
                   || editHtml.match(/name="[^"]*agreement_end_date[^"]*"\s+value="(\d{4}-\d{2}-\d{2})"/i)
                   || editHtml.match(/value="(\d{4}-\d{2}-\d{2})"[^>]*name="[^"]*date[^"]*"/i); // Fallback

    if (!dateMatch) {
         console.log(`[fetch-contract-end-date] Date field not found on page ${productId}.`);
         return new Response(JSON.stringify({ 
            endDate: null, 
            message: "Product found, but could not extract 'Agreement End Date' from page." 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const endDate = dateMatch[1];
    console.log(`[fetch-contract-end-date] 3. Found End Date: ${endDate}`);

    return new Response(JSON.stringify({ 
      endDate, 
      message: "Agreement End Date synced successfully." 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('[fetch-contract-end-date] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})