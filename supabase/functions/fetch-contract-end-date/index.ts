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
    // UPDATED REGEX: Specifically looks for edit links where the ID is NOT 0.
    // Matches /products/edit/[NON-ZERO DIGIT]...
    // [1-9]\d* matches any number starting with 1-9 (e.g., 1, 5, 10, 5987)
    const productLinkMatch = searchHtml.match(/href="([^"]*\/products\/edit\/[1-9]\d*\/[^"]*)"/);
    
    if (!productLinkMatch) {
        console.log(`[fetch-contract-end-date] Specific product edit link not found for ${sku}. Checking for any edit link as fallback...`);
        
        // Debug: Check if we found the "create new" link (ID 0) just to log it
        const createLinkMatch = searchHtml.match(/href="([^"]*\/products\/edit\/0\/[^"]*)"/);
        if (createLinkMatch) {
             console.log(`[fetch-contract-end-date] Found 'Create New' link (ID 0), but ignoring it.`);
        }

        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Search for ${sku} returned no valid product links. (Ignored 'create new' links).`,
            url: searchUrl // Return search URL so user can check
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const relativeEditUrl = productLinkMatch[1];
    const editUrl = `https://portal.kassoehousing.com${relativeEditUrl}`;
    
    console.log(`[fetch-contract-end-date] 2. Found Valid Edit URL: ${editUrl}. Fetching details...`);

    // 3. FETCH DETAILS STEP
    const editRes = await fetch(editUrl, { headers });
    const rawHtml = await editRes.text();
    
    // NORMALIZE HTML: Remove newlines and excessive spaces to make regex reliable against scattered attributes
    const editHtml = rawHtml.replace(/\s+/g, ' ');

    // 4. PARSE DATE STEP
    let dateStr = "";
    let extractionMethod = "";

    // Matches: DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD
    const dateRegexStr = "(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{4})";
    
    // Keywords to identify the correct field
    const keywords = ['end_date', 'end-date', 'End date', 'Slutdato', 'Ophørsdato', 'Contract end', 'Expiry'];
    const keywordPattern = keywords.join('|');

    // Strategy A: Contextual Value Search (Backward)
    // Find *any* value="DATE"
    // Then check the preceding context for "end_date" identifiers
    // Increased window to 1000 chars
    if (!dateStr) {
        const valueMatches = [...editHtml.matchAll(new RegExp(`value=["']${dateRegexStr}["']`, 'gi'))];
        
        for (const match of valueMatches) {
            const dateVal = match[1];
            const index = match.index || 0;
            // Look at the 1000 chars BEFORE this match
            const context = editHtml.substring(Math.max(0, index - 1000), index);
            
            if (new RegExp(keywordPattern, 'i').test(context)) {
                dateStr = dateVal;
                extractionMethod = "Strategy A: Contextual Value (Backward)";
                console.log(`[fetch-contract-end-date] ${extractionMethod} found: ${dateStr}`);
                break;
            }
        }
    }

    // Strategy B: JSON/Script Variable Assignment (Loose)
    if (!dateStr) {
        const jsonPatterns = [
            new RegExp(`["']end_date["']\\s*:\\s*["']${dateRegexStr}["']`, 'i'), 
            new RegExp(`end_date\\s*=\\s*["']${dateRegexStr}["']`, 'i'),
            new RegExp(`\\.val\\s*\\(\\s*["']${dateRegexStr}["']\\s*\\)`, 'i') // jQuery .val()
        ];

        for (const pattern of jsonPatterns) {
            const match = editHtml.match(pattern);
            if (match) {
                dateStr = match[1];
                extractionMethod = "Strategy B: JSON/Script Variable";
                console.log(`[fetch-contract-end-date] ${extractionMethod} found: ${dateStr}`);
                break;
            }
        }
    }

    // Strategy C: Spatial Search (Post-Label in Flattened HTML)
    // Increased window to 2000 chars
    if (!dateStr) {
        const labelRegex = new RegExp(`>\\s*(${keywordPattern})\\s*[:<]`, 'i');
        const labelMatch = editHtml.match(labelRegex);
        
        if (labelMatch && labelMatch.index !== undefined) {
            // Scan the 2000 chars following the label
            const searchWindow = editHtml.substring(labelMatch.index, labelMatch.index + 2000);
            
            const datePattern = new RegExp(dateRegexStr, 'i');
            const dateMatch = searchWindow.match(datePattern);
            
            if (dateMatch) {
                dateStr = dateMatch[0];
                extractionMethod = "Strategy C: Spatial (Post-Label)";
                console.log(`[fetch-contract-end-date] ${extractionMethod} found: ${dateStr}`);
            }
        }
    }

    // Strategy D: Attribute Search (Forward)
    // Increased window to 1000 chars
    if (!dateStr) {
        const nameRegex = /name=["']end_date["']/i;
        const nameMatch = editHtml.match(nameRegex);

        if (nameMatch && nameMatch.index !== undefined) {
            // Scan 1000 chars forward for a value attribute containing a date
            const searchWindow = editHtml.substring(nameMatch.index, nameMatch.index + 1000);
            const valueDateRegex = new RegExp(`value=["']${dateRegexStr}["']`, 'i');
            const valueMatch = searchWindow.match(valueDateRegex);

            if (valueMatch) {
                dateStr = valueMatch[1];
                extractionMethod = "Strategy D: Attribute Search (Forward)";
                console.log(`[fetch-contract-end-date] ${extractionMethod} found: ${dateStr}`);
            }
        }
    }

    // Strategy E: Proximity Fallback (Global Date Scan)
    // Find ALL dates, pick the one closest to a keyword
    if (!dateStr) {
        const allDateMatches = [...editHtml.matchAll(new RegExp(dateRegexStr, 'gi'))];
        let closestDistance = Infinity;
        let bestCandidate = "";

        // Find all keyword occurrences
        const keywordMatches = [...editHtml.matchAll(new RegExp(keywordPattern, 'gi'))];

        for (const dateMatch of allDateMatches) {
            const dateIndex = dateMatch.index || 0;
            const dateVal = dateMatch[0];

            for (const kwMatch of keywordMatches) {
                const kwIndex = kwMatch.index || 0;
                // Only consider if date appears AFTER keyword (typical for forms)
                // and within reasonable distance (e.g. 1500 chars)
                const dist = dateIndex - kwIndex;
                if (dist > 0 && dist < 1500 && dist < closestDistance) {
                    closestDistance = dist;
                    bestCandidate = dateVal;
                }
            }
        }

        if (bestCandidate) {
            dateStr = bestCandidate;
            extractionMethod = "Strategy E: Proximity Fallback";
            console.log(`[fetch-contract-end-date] ${extractionMethod} found: ${dateStr} (distance: ${closestDistance})`);
        }
    }

    if (!dateStr || dateStr.trim() === '') {
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Could not extract End Date. All strategies (A-E) failed. HTML scanned: ${editHtml.length} chars.`,
            url: editUrl 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. FORMAT DATE
    let endDate = dateStr;
    
    // Normalize format: regex for D.M.YYYY, D-M-YYYY, D/M/YYYY
    const ddmmyyyyRegex = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;
    const dateMatch = dateStr.match(ddmmyyyyRegex);

    if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].padStart(2, '0');
        const year = dateMatch[3];
        // Reformat to yyyy-mm-dd
        endDate = `${year}-${month}-${day}`;
    }

    // Basic validity check
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
         return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Found value '${dateStr}' via ${extractionMethod} but format conversion failed.` 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[fetch-contract-end-date] 3. Success! End Date: ${endDate} (Method: ${extractionMethod})`);

    return new Response(JSON.stringify({ 
      endDate, 
      message: `Agreement End Date synced successfully (${endDate}).` 
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