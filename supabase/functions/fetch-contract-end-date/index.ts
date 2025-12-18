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

    if (searchHtml.includes('name="login"') || searchHtml.includes('class="login"')) {
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: "Authentication failed (Login page detected during search). Check your cookie." 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. PARSE LINK STEP (Extract FULL Edit URL)
    // We capture the entire relative href, e.g. /admin/kassoe-theme/products/edit/5987/367
    const productLinkMatch = searchHtml.match(/href="([^"]*\/products\/edit\/[^"]*)"/);
    
    if (!productLinkMatch) {
        console.log(`[fetch-contract-end-date] Edit link not found in search results for ${sku}.`);
        const skuFound = searchHtml.includes(sku);
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Search for ${sku} returned no edit links.${!skuFound ? " SKU text not found in results." : ""}` 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const relativeEditUrl = productLinkMatch[1];
    const editUrl = `https://portal.kassoehousing.com${relativeEditUrl}`;
    
    console.log(`[fetch-contract-end-date] 2. Found Edit URL: ${editUrl}. Fetching details...`);

    // 3. FETCH DETAILS STEP
    const editRes = await fetch(editUrl, { headers });
    const editHtml = await editRes.text();

    // 4. PARSE DATE STEP
    
    // Find the input tag that definitely contains name="end_date"
    const inputTagRegex = /<input[^>]*name="end_date"[^>]*>/i;
    const inputTagMatch = editHtml.match(inputTagRegex);

    if (!inputTagMatch) {
         // DEBUG: Return Page Title to see where we landed
         const titleMatch = editHtml.match(/<title>(.*?)<\/title>/i);
         const pageTitle = titleMatch ? titleMatch[1] : "No Title Found";
         
         // Check for login forms again on this page
         const isLogin = editHtml.includes('name="login"') || editHtml.includes('class="login"');

         console.log(`[fetch-contract-end-date] Input tag 'end_date' not found. Page Title: ${pageTitle}`);
         
         return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Product found, but 'end_date' field missing. Page Title: "${pageTitle}". ${isLogin ? "Seems to be a login page." : "Check page content."}`
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const inputTag = inputTagMatch[0];
    console.log(`[fetch-contract-end-date] Found input tag: ${inputTag}`);

    // Extract value attribute
    const valueMatch = inputTag.match(/value=["']([^"']+)["']/i);

    if (!valueMatch) {
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Found 'end_date' input, but 'value' attribute is missing.` 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let dateStr = valueMatch[1];
    console.log(`[fetch-contract-end-date] Raw date string found: ${dateStr}`);

    if (!dateStr || dateStr.trim() === '') {
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: "Found 'end_date' input, but value is empty." 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. FORMAT DATE
    let endDate = dateStr;
    const ddmmyyyyRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const dateMatch = dateStr.match(ddmmyyyyRegex);

    if (dateMatch) {
        // Reformat from dd/mm/yyyy to yyyy-mm-dd
        endDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    } else {
        // Check if it's already YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
             return new Response(JSON.stringify({ 
                endDate: null, 
                message: `Found date '${dateStr}' but could not parse format (expected DD/MM/YYYY).` 
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
    }

    console.log(`[fetch-contract-end-date] 3. Success! End Date: ${endDate}`);

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