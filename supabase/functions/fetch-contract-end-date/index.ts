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

    // Strategy A: Standard Input Value
    // Look for <input ... name="end_date" ... value="...">
    // We construct a regex that finds the name attribute, then looks around it
    const inputTagRegex = /<input[^>]*name="end_date"[^>]*>/i;
    const inputTagMatch = editHtml.match(inputTagRegex);

    if (inputTagMatch) {
        const inputTag = inputTagMatch[0];
        // Check for value attribute (flexible quotes and spacing)
        const valueMatch = inputTag.match(/value\s*=\s*["']([^"']+)["']/i);
        if (valueMatch && valueMatch[1].trim()) {
            dateStr = valueMatch[1];
            console.log(`[fetch-contract-end-date] Strategy A: Found date in input value: ${dateStr}`);
        }
    }

    // Strategy B: JavaScript Value Assignment
    // Matches: $('#end-date').val('...') or document.getElementById('end-date').value = '...'
    // This often appears in script tags at the bottom of the page
    if (!dateStr) {
        // Look for ID based assignment
        const idAssignmentRegex = /['"]#end-date['"]\s*\)\s*\.val\s*\(\s*['"]([^'"]+)['"]\s*\)/i;
        const idMatch = editHtml.match(idAssignmentRegex);
        if (idMatch) {
            dateStr = idMatch[1];
            console.log(`[fetch-contract-end-date] Strategy B: Found date in JS val() for #end-date: ${dateStr}`);
        }
    }

    // Strategy C: Aggressive Search for Nearest Date
    // If explicit field binding isn't found, find the "end_date" label/input in HTML 
    // and grab the closest subsequent date string.
    if (!dateStr) {
        console.log(`[fetch-contract-end-date] Strategy C: Searching for nearest date string...`);
        
        // 1. Find position of the input field
        const anchorRegex = /name="end_date"/i;
        const anchorMatch = editHtml.match(anchorRegex);
        
        if (anchorMatch && anchorMatch.index !== undefined) {
            const anchorIndex = anchorMatch.index;
            
            // 2. Find ALL date-like strings in the document
            // Patterns: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD
            const datePattern = /\b(\d{2}[./-]\d{2}[./-]\d{4})|(\d{4}-\d{2}-\d{2})\b/g;
            
            let bestMatch = null;
            let minDistance = Infinity;

            for (const match of editHtml.matchAll(datePattern)) {
                // Calculate distance from the "end_date" input
                // We typically expect the value to be AFTER the name attribute
                const dist = match.index - anchorIndex;
                
                // We accept dates that are shortly after (e.g. in value attribute or script) 
                // but not too far (e.g. unrelated footer dates). 
                // 5000 chars covers a lot of script blocks.
                if (dist > 0 && dist < 5000) { 
                    if (dist < minDistance) {
                        minDistance = dist;
                        bestMatch = match[0];
                    }
                }
            }

            if (bestMatch) {
                dateStr = bestMatch;
                console.log(`[fetch-contract-end-date] Strategy C: Found nearest date (${minDistance} chars after input): ${dateStr}`);
            }
        }
    }

    // If still no date, return all found dates for debugging
    if (!dateStr || dateStr.trim() === '') {
        const inputContext = inputTagMatch ? inputTagMatch[0] : "Input not found";
        
        // Collect all dates found in the document to help user debug
        const allDates = [...editHtml.matchAll(/\b(\d{2}[./-]\d{2}[./-]\d{4})|(\d{4}-\d{2}-\d{2})\b/g)]
            .map(m => m[0])
            .slice(0, 10); // Limit to first 10 to avoid huge payload

        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Could not extract End Date. Input tag found: "${inputContext}". Dates found in doc: [${allDates.join(', ')}].` 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. PARSE & FORMAT DATE (Standardize to YYYY-MM-DD)
    let endDate = dateStr;
    
    // Check format: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const ddmmyyyyRegex = /^(\d{2})[./-](\d{2})[./-](\d{4})$/;
    const dateMatch = dateStr.match(ddmmyyyyRegex);

    if (dateMatch) {
        // Reformat from dd/mm/yyyy to yyyy-mm-dd
        endDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        // Already YYYY-MM-DD, do nothing
        endDate = dateStr;
    } else {
         return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Found date string '${dateStr}' but could not parse format (expected DD/MM/YYYY or YYYY-MM-DD).` 
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