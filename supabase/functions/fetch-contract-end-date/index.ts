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
    const productLinkMatch = searchHtml.match(/href="([^"]*\/products\/edit\/[1-9]\d*\/[^"]*)"/);
    
    if (!productLinkMatch) {
        console.log(`[fetch-contract-end-date] Specific product edit link not found for ${sku}.`);
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Search for ${sku} returned no valid product links.`,
            url: searchUrl 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const relativeEditUrl = productLinkMatch[1];
    const editUrl = `https://portal.kassoehousing.com${relativeEditUrl}`;
    
    console.log(`[fetch-contract-end-date] 2. Found Valid Edit URL: ${editUrl}. Fetching details...`);

    // 3. FETCH DETAILS STEP
    const editRes = await fetch(editUrl, { headers });
    const rawHtml = await editRes.text();
    const editHtml = rawHtml.replace(/\s+/g, ' ');

    // 4. PARSE DATE STEP
    let dateStr = "";
    let extractionMethod = "";

    // Matches: DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD
    const dateRegexStr = "\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{4}";
    const dateValidator = new RegExp(`^(${dateRegexStr})$`);

    // Strategy 1: Strict Input Field Match (Forward Search)
    if (!dateStr) {
        const fieldNames = ['end_date', 'slutdato', 'ophørsdato', 'expiry'];
        const namePattern = fieldNames.join('|');
        const nameRegex = new RegExp(`name=["'][^"']*(${namePattern})[^"']*["']`, 'gi');
        
        let nameMatch;
        while ((nameMatch = nameRegex.exec(editHtml)) !== null) {
            const nameIndex = matchIndex(nameMatch);
            const searchWindow = editHtml.substring(nameIndex, nameIndex + 400);
            const valueMatch = searchWindow.match(/value=["']([^"']*)["']/i);
            
            if (valueMatch) {
                const val = valueMatch[1];
                if (dateValidator.test(val)) {
                    dateStr = val;
                    extractionMethod = `Strategy 1: Strict Input (name="${nameMatch[0]}")`;
                    break; 
                } else if (val === "") {
                    console.log(`[fetch-contract-end-date] Found target field '${nameMatch[0]}' but value is empty.`);
                    extractionMethod = "Empty Target Field";
                    break;
                }
            }
        }
    }

    // Strategy 2: JSON/Script Variable Assignment
    if (!dateStr && extractionMethod !== "Empty Target Field") {
        const jsonPatterns = [
            new RegExp(`["'](?:end_date|slutdato)["']\\s*:\\s*["'](${dateRegexStr})["']`, 'i'), 
            new RegExp(`end_date\\s*=\\s*["'](${dateRegexStr})["']`, 'i'),
        ];

        for (const pattern of jsonPatterns) {
            const match = editHtml.match(pattern);
            if (match) {
                dateStr = match[1];
                extractionMethod = "Strategy 2: JSON/Script Variable";
                break;
            }
        }
    }

    // *** MODIFIED LOGIC HERE ***
    if (!dateStr || dateStr.trim() === '') {
        // If we found the page but found no date, we now assume it is INTENTIONALLY empty.
        // This triggers the frontend to clear the field.
        return new Response(JSON.stringify({ 
            endDate: null, 
            isExplicitlyEmpty: true, // Changed to TRUE to force clearing
            message: `No date found on external portal. Field will be cleared. (${extractionMethod || 'No match found'})`,
            url: editUrl 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. FORMAT DATE
    let endDate = dateStr;
    const ddmmyyyyRegex = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;
    const dateMatch = dateStr.match(ddmmyyyyRegex);

    if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].padStart(2, '0');
        const year = dateMatch[3];
        endDate = `${year}-${month}-${day}`;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
         // If format conversion fails, treat as empty/null rather than erroring out?
         // For safety, let's just return null but not force empty, so user can check manually.
         return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Found value '${dateStr}' but format conversion failed.`,
            url: editUrl
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[fetch-contract-end-date] 3. Success! End Date: ${endDate} (Method: ${extractionMethod})`);

    return new Response(JSON.stringify({ 
      endDate, 
      isExplicitlyEmpty: false,
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

function matchIndex(match: RegExpExecArray): number {
    return match.index !== undefined ? match.index : 0;
}