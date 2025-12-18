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

    console.log(`[fetch-contract-end-date] 1. Searching for SKU: ${sku}...`);

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
            message: "Authentication failed (Login page detected). Check your cookie." 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. PARSE LINK STEP
    const productLinkMatch = searchHtml.match(/href="([^"]*\/products\/edit\/[^"]*)"/);
    
    if (!productLinkMatch) {
        console.log(`[fetch-contract-end-date] Edit link not found for ${sku}.`);
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Search for ${sku} returned no edit links.` 
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

    // Strategy A: Direct Attribute Search (Loose)
    // Matches: id="end-date" ... value="31/12/2025" OR value="31/12/2025" ... id="end-date"
    // Handles attributes being separated by newlines or other attributes
    const looseValueRegex = /(?:id=["']end-date["']|name=["']end_date["'])[\s\S]*?value=["'](\d{2}[./-]\d{2}[./-]\d{4})["']|value=["'](\d{2}[./-]\d{2}[./-]\d{4})["'][\s\S]*?(?:id=["']end-date["']|name=["']end_date["'])/i;
    const looseMatch = editHtml.match(looseValueRegex);
    if (looseMatch) {
        dateStr = looseMatch[1] || looseMatch[2];
        console.log(`[fetch-contract-end-date] Strategy A (Loose Attr) found: ${dateStr}`);
    }

    // Strategy B: Javascript Value Assignment
    if (!dateStr) {
        const jsDateRegex = /val\s*\(\s*["'](\d{2}[./-]\d{2}[./-]\d{4})["']\s*\)/i;
        const jsMatch = editHtml.match(jsDateRegex);
        if (jsMatch) {
            dateStr = jsMatch[1];
            console.log(`[fetch-contract-end-date] Strategy B (JS) found: ${dateStr}`);
        }
    }

    // Strategy C: Spatial Search (Nearest date after "End date" label)
    if (!dateStr) {
        console.log(`[fetch-contract-end-date] Strategy C: Searching for nearest date string...`);
        const labelRegex = />\s*End date\s*</i;
        const labelMatch = editHtml.match(labelRegex);
        
        if (labelMatch && labelMatch.index !== undefined) {
            // Scan the 2000 chars following the label
            const searchWindow = editHtml.substring(labelMatch.index, labelMatch.index + 2000);
            const datePattern = /(\d{2}[./-]\d{2}[./-]\d{4})/g;
            const dateMatches = [...searchWindow.matchAll(datePattern)];
            
            if (dateMatches.length > 0) {
                // Take the first date found after the label
                dateStr = dateMatches[0][0];
                console.log(`[fetch-contract-end-date] Strategy C found: ${dateStr}`);
            }
        }
    }

    // Strategy D: Last Resort - Any future date in doc
    if (!dateStr) {
         console.log(`[fetch-contract-end-date] Strategy D: Searching entire doc for any valid dates...`);
         const allDates = [...editHtml.matchAll(/(\d{2}[./-]\d{2}[./-]\d{4})/g)].map(m => m[0]);
         // Filter for potential valid dates (e.g. containing 2024, 2025, etc)
         const futureDates = allDates.filter(d => d.includes('202') || d.includes('203'));
         if (futureDates.length > 0) {
             dateStr = futureDates[0]; // Take the first plausible future date
             console.log(`[fetch-contract-end-date] Strategy D found: ${dateStr}`);
         }
    }

    if (!dateStr || dateStr.trim() === '') {
        const debugSnippet = editHtml.substring(0, 1000).replace(/</g, '&lt;'); // Grab head of doc for context
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Could not extract End Date. Deep search failed. Page preview: ${debugSnippet.substring(0, 200)}...` 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. FORMAT DATE
    let endDate = dateStr;
    const ddmmyyyyRegex = /^(\d{2})[./-](\d{2})[./-](\d{4})$/;
    const dateMatch = dateStr.match(ddmmyyyyRegex);

    if (dateMatch) {
        // Reformat from dd/mm/yyyy to yyyy-mm-dd
        endDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }

    // Basic validity check
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
         return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Found date string '${dateStr}' but format conversion failed.` 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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