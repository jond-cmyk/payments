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
    let extractionMethod = "";

    // Strategy A: Direct Attribute Search (Loose)
    // Matches: value="31/12/2025" ... id="end-date" OR name="end_date" ... value="31/12/2025"
    // We look for the specific field identifiers first
    const directValueRegex = /(?:name=["']end_date["']|id=["']end-date["'])[^>]*value=["'](\d{2}[./-]\d{2}[./-]\d{4})["']/i;
    const directMatch = editHtml.match(directValueRegex);
    
    if (directMatch) {
        dateStr = directMatch[1];
        extractionMethod = "Direct Input Value";
        console.log(`[fetch-contract-end-date] Strategy A (Direct) found: ${dateStr}`);
    }

    // Strategy B: JSON/Script Variable Assignment
    // Often data is passed as a JSON object: "end_date":"2025-12-31" or similar
    if (!dateStr) {
        const jsonPatterns = [
            /["']end_date["']\s*:\s*["'](\d{4}-\d{2}-\d{2})["']/i, // "end_date": "YYYY-MM-DD"
            /["']end_date["']\s*:\s*["'](\d{2}[./-]\d{2}[./-]\d{4})["']/i, // "end_date": "DD/MM/YYYY"
            /end_date\s*=\s*["'](\d{4}-\d{2}-\d{2})["']/i, // end_date = "YYYY-MM-DD"
            /end_date\s*=\s*["'](\d{2}[./-]\d{2}[./-]\d{4})["']/i // end_date = "DD/MM/YYYY"
        ];

        for (const pattern of jsonPatterns) {
            const match = editHtml.match(pattern);
            if (match) {
                dateStr = match[1];
                extractionMethod = "JSON/Script Variable";
                console.log(`[fetch-contract-end-date] Strategy B (JSON) found: ${dateStr}`);
                break;
            }
        }
    }

    // Strategy C: Tight Spatial Search (Date immediately following label)
    // Only looks 300 chars ahead to prevent finding footer dates
    if (!dateStr) {
        console.log(`[fetch-contract-end-date] Strategy C: Searching near 'End date' label...`);
        // Find label
        const labelRegex = /<label[^>]*for=["']end-date["'][^>]*>.*?End date.*?<\/label>/is;
        const labelMatch = editHtml.match(labelRegex);
        
        if (labelMatch && labelMatch.index !== undefined) {
            // Scan ONLY the next 300 characters
            const searchWindow = editHtml.substring(labelMatch.index, labelMatch.index + 300);
            
            // Look for date pattern
            const datePattern = /(\d{2}[./-]\d{2}[./-]\d{4})/g; // DD/MM/YYYY
            const dateMatches = [...searchWindow.matchAll(datePattern)];
            
            if (dateMatches.length > 0) {
                dateStr = dateMatches[0][0];
                extractionMethod = "Spatial (Near Label)";
                console.log(`[fetch-contract-end-date] Strategy C found: ${dateStr}`);
            }
        }
    }

    // Strategy D: Check for 'placeholder' attribute if value is empty, sometimes used as default
    if (!dateStr) {
       const placeholderRegex = /(?:name=["']end_date["']|id=["']end-date["'])[^>]*placeholder=["'](\d{2}[./-]\d{2}[./-]\d{4})["']/i;
       const phMatch = editHtml.match(placeholderRegex);
       if (phMatch) {
           dateStr = phMatch[1];
           extractionMethod = "Placeholder Attribute";
       }
    }

    if (!dateStr || dateStr.trim() === '') {
        const debugSnippet = editHtml.substring(0, 1000).replace(/</g, '&lt;'); 
        return new Response(JSON.stringify({ 
            endDate: null, 
            message: `Could not extract End Date. Specific search strategies failed. Please ensure the date is visible in the 'End date' field on the portal.` 
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