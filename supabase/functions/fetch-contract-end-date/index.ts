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

    // 2. PARSE LINK STEP
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
    let dateStr = "";

    // Array of Regex Strategies based on user feedback
    const regexStrategies = [
        // Strategy 1: Explicit ID + Value (The structure provided by user)
        // Matches: id="end-date" ... value="31/12/2025"
        /id=["']end-date["'][^>]*value=["']([^"']+)["']/i,
        
        // Strategy 2: Explicit Name + Value
        // Matches: name="end_date" ... value="31/12/2025"
        /name=["']end_date["'][^>]*value=["']([^"']+)["']/i,
        
        // Strategy 3: Value + Explicit ID (Reverse order)
        // Matches: value="31/12/2025" ... id="end-date"
        /value=["']([^"']+)["'][^>]*id=["']end-date["']/i,

        // Strategy 4: Fallback to the generic Input tag capture from before, but looser
        /<input[^>]*name=["']end_date["'][^>]*value=["']([^"']+)["'][^>]*>/i
    ];

    for (const regex of regexStrategies) {
        const match = editHtml.match(regex);
        if (match && match[1]) {
            dateStr = match[1];
            console.log(`[fetch-contract-end-date] Date found using regex: ${regex.source}`);
            break;
        }
    }

    // Strategy 5: Deep Search (Javascript assignments)
    if (!dateStr) {
        const jsMatch = editHtml.match(/val\s*\(\s*["'](\d{2}\/\d{2}\/\d{4})["']\s*\)/i);
        if (jsMatch) dateStr = jsMatch[1];
    }

    if (!dateStr || dateStr.trim() === '') {
        // Find the input tag to show context in error
        const simpleMatch = editHtml.match(/<input[^>]*name=["']end_date["'][^>]*>/i);
        const inputContext = simpleMatch ? simpleMatch[0] : "Input tag not found";
        
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Could not extract End Date value. Tag found: "${inputContext}". It implies the 'value' attribute is missing from the server response, despite appearing in browser dev tools.` 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[fetch-contract-end-date] Raw extracted date string: "${dateStr}"`);

    // 5. FORMAT DATE
    let endDate = dateStr;
    const ddmmyyyyRegex = /^(\d{2})[./-](\d{2})[./-](\d{4})$/;
    const dateMatch = dateStr.match(ddmmyyyyRegex);

    if (dateMatch) {
        // Reformat from dd/mm/yyyy to yyyy-mm-dd
        endDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    } else {
        // Check if it's already YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
             return new Response(JSON.stringify({ 
                endDate: null, 
                message: `Found date string '${dateStr}' but could not parse format (expected DD/MM/YYYY).` 
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