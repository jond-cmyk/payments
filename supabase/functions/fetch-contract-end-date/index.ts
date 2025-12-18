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
        message: "Missing 'KASSOE_ADMIN_COOKIE' secret. Cannot authenticate with portal." 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const headers = {
      'Cookie': adminCookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    console.log(`[fetch-contract-end-date] 1. Searching for SKU: ${sku} in category 367...`);

    // 1. SEARCH STEP
    // We filter by KassoeThemeProducts__sku on category 367
    const searchUrl = `https://portal.kassoehousing.com/admin/kassoe-theme/categories/edit/367?Filter[KassoeThemeProducts__sku]=${encodeURIComponent(sku)}`;
    
    const searchRes = await fetch(searchUrl, { headers });
    
    if (!searchRes.ok) {
        if (searchRes.status === 403 || searchRes.url.includes('login')) {
             return new Response(JSON.stringify({ 
                endDate: null, 
                message: "Authentication failed. Your KASSOE_ADMIN_COOKIE (vmcms) may be expired." 
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        throw new Error(`Failed to search portal. Status: ${searchRes.status}`);
    }
    
    const searchHtml = await searchRes.text();

    // Check if login page was returned (sometimes status is 200 even for login page)
    if (searchHtml.includes('name="login"') || searchHtml.includes('class="login"')) {
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: "Authentication failed (Login page detected). Check your cookie." 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. PARSE ID STEP
    // We look for an edit link. Typically /admin/kassoe-theme/products/edit/{ID}
    // We use a flexible regex that looks for 'products/edit/' followed by digits.
    const productLinkMatch = searchHtml.match(/href="[^"]*\/products\/edit\/(\d+)[^"]*"/);
    
    if (!productLinkMatch) {
        console.log(`[fetch-contract-end-date] Product ID not found in search results for ${sku}.`);
        
        // Check if the SKU text is even present in the HTML
        const skuFound = searchHtml.includes(sku);
        
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Search for ${sku} returned no edit links.${!skuFound ? " SKU text not found in results." : ""}` 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const productId = productLinkMatch[1];
    console.log(`[fetch-contract-end-date] 2. Found Product ID: ${productId}. Fetching details...`);

    // 3. FETCH DETAILS STEP
    const editUrl = `https://portal.kassoehousing.com/admin/kassoe-theme/products/edit/${productId}`;
    const editRes = await fetch(editUrl, { headers });
    const editHtml = await editRes.text();

    // 4. PARSE DATE STEP
    // We try to match the Agreement End Date field. 
    // We look for 'agreement_end_date' or 'contract_end_date' input with a value.
    const dateMatch = editHtml.match(/name="[^"]*agreement_end_date[^"]*"\s+value="(\d{4}-\d{2}-\d{2})"/i)
                   || editHtml.match(/name="[^"]*contract_end_date[^"]*"\s+value="(\d{4}-\d{2}-\d{2})"/i)
                   || editHtml.match(/value="(\d{4}-\d{2}-\d{2})"[^>]*name="[^"]*agreement_end_date[^"]*"/i);

    if (!dateMatch) {
         console.log(`[fetch-contract-end-date] Date field not found on page ${productId}.`);
         return new Response(JSON.stringify({ 
            endDate: null, 
            message: "Product found, but 'Agreement End Date' field is empty or missing." 
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