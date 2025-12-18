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
    // Look for edit links where the ID is NOT 0
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
    
    // NORMALIZE HTML: Remove newlines and excessive spaces to make regex reliable
    const editHtml = rawHtml.replace(/\s+/g, ' ');

    // 4. PARSE DATE STEP
    let dateStr = "";
    let extractionMethod = "";

    // Matches: DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD
    const dateRegexStr = "\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[./-]\\d{1,2}[./-]\\d{4}";
    const dateValidator = new RegExp(`^(${dateRegexStr})$`);

    // Strategy 1: Strict Input Field Match (Forward Search)
    // We look for the name attribute containing specific keywords, then find the immediate value attribute.
    if (!dateStr) {
        const fieldNames = ['end_date', 'slutdato', 'ophørsdato', 'expiry'];
        const namePattern = fieldNames.join('|');
        
        // Regex to find the input tag name attribute
        const nameRegex = new RegExp(`name=["'][^"']*(${namePattern})[^"']*["']`, 'gi');
        
        let nameMatch;
        while ((nameMatch = nameRegex.exec(editHtml)) !== null) {
            const nameIndex = matchIndex(nameMatch);
            
            // Look ahead for the value attribute within 400 chars (generous input tag length)
            const searchWindow = editHtml.substring(nameIndex, nameIndex + 400);
            
            // Find the FIRST value attribute
            const valueMatch = searchWindow.match(/value=["']([^"']*)["']/i);
            
            if (valueMatch) {
                const val = valueMatch[1];
                if (dateValidator.test(val)) {
                    dateStr = val;
                    extractionMethod = `Strategy 1: Strict Input (name="${nameMatch[0]}")`;
                    console.log(`[fetch-contract-end-date] Found date in specific input field: ${dateStr}`);
                    break; 
                } else if (val === "") {
                    // Critical: If the targeted field is empty, STOP.
                    // This prevents finding "Terminated Date" or other dates later in the doc.
                    console.log(`[fetch-contract-end-date] Found target field '${nameMatch[0]}' but value is empty.`);
                    extractionMethod = "Empty Target Field";
                    break;
                }
            }
        }
    }

    // Strategy 2: JSON/Script Variable Assignment (Strict)
    // Only run if we haven't definitively found (or found empty) the field
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
                console.log(`[fetch-contract-end-date] ${extractionMethod} found: ${dateStr}`);
                break;
            }
        }
    }

    // REMOVED: Loose "Proximity" strategies that scanned for any date near a label.
    // This was causing the issue where empty fields were skipped and the next populated date was picked.

    if (!dateStr || dateStr.trim() === '') {
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `End Date field is empty or not found. (${extractionMethod || 'No match'})`,
            url: editUrl 
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 5. FORMAT DATE
    let endDate = dateStr;
    
    // Normalize format
    const ddmmyyyyRegex = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;
    const dateMatch = dateStr.match(ddmmyyyyRegex);

    if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].padStart(2, '0');
        const year = dateMatch[3];
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

// Helper to safely get index from regex match result
function matchIndex(match: RegExpExecArray): number {
    return match.index !== undefined ? match.index : 0;
}