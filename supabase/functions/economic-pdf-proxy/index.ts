// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// @ts-ignore
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    // @ts-ignore
    const appSecretToken = Deno.env.get("ECONOMIC_APP_SECRET_TOKEN");
    // @ts-ignore
    const agreementGrantToken = Deno.env.get("ECONOMIC_AGREEMENT_GRANT_TOKEN");

    if (!appSecretToken || !agreementGrantToken) {
      return new Response(
        JSON.stringify({ error: "Missing e-conomic secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Extract path from query parameters
    const url = new URL(req.url);
    const path = url.searchParams.get("path");
    
    if (!path) {
      return new Response(
        JSON.stringify({ error: "Missing 'path' query parameter." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseUrl = "https://restapi.e-conomic.com";
    const fullUrl = `${baseUrl}${path.startsWith("/") ? path : "/" + path}`;

    const headers: HeadersInit = {
      "X-AppSecretToken": appSecretToken,
      "X-AgreementGrantToken": agreementGrantToken,
      // Removed "Accept": "application/pdf"
      "User-Agent": "SupabaseEdge/1.0",
    };

    console.log(`[economic-pdf-proxy] Fetching PDF URL: ${fullUrl}`);

    const response = await fetch(fullUrl, {
      method: "GET",
      headers: headers,
    });

    console.log(`[economic-pdf-proxy] e-conomic API response status: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[economic-pdf-proxy] Failed to fetch PDF. Status: ${response.status}, Body: ${errorBody.substring(0, 200)}`);
      
      // Handle 401/403 specifically
      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ 
            error: "Unauthorized access to PDF. Check e-conomic tokens.",
            httpStatusCode: response.status,
            demoLink: `${fullUrl}?demo=true`
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ error: `Failed to fetch PDF: Status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Success: Return the raw PDF response
    const responseHeaders = new Headers(response.headers);
    
    // Ensure Content-Disposition is set for download/view
    const contentDisposition = responseHeaders.get('Content-Disposition') || 'inline; filename="invoice.pdf"';

    // Create new headers for the final response
    const finalHeaders = {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition,
        'Cache-Control': 'public, max-age=31536000', // Cache for a year
    };

    return new Response(response.body, {
      status: 200,
      headers: finalHeaders,
    });

  } catch (error: any) {
    console.error(`[economic-pdf-proxy] Unhandled error: ${error?.message}`, error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unexpected error in PDF proxy." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});