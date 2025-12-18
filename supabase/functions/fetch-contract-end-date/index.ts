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

    console.log(`[fetch-contract-end-date] Checking for SKU: ${sku}`);

    // -------------------------------------------------------------------------
    // TODO: Implement external fetch logic here
    // -------------------------------------------------------------------------
    // 1. Fetch the external website/API
    //    const response = await fetch(`https://portal.kassoehousing.com/api/contract?sku=${sku}`);
    //    const data = await response.json();
    //
    // 2. Extract the end date (format YYYY-MM-DD)
    //    const endDate = data.end_date; 
    
    // For now, we return null to indicate no logic is present yet.
    // If you uncomment the line below, it will simulate finding a date 1 year from now.
    // const endDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];
    const endDate = null; 

    return new Response(JSON.stringify({ 
      endDate, 
      message: endDate ? "Date found." : "External logic not configured. Please update 'fetch-contract-end-date' function." 
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