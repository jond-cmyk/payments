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
    // Get UK tokens
    // @ts-ignore
    const ukAppSecretToken = Deno.env.get("ECONOMIC_APP_UK_SECRET_TOKEN");
    // @ts-ignore
    const ukAgreementGrantToken = Deno.env.get("ECONOMIC_AGREEMENT_UK_GRANT_TOKEN");

    // Get Swiss tokens (with fallback to older names)
    // @ts-ignore
    let swissAppSecretToken = Deno.env.get("SWISS_ECONOMIC_APP_SECRET_TOKEN");
    // @ts-ignore
    let swissAgreementGrantToken = Deno.env.get("SWISS_ECONOMIC_AGREEMENT_GRANT_TOKEN");
    if (!swissAppSecretToken) {
      // @ts-ignore
      swissAppSecretToken = Deno.env.get("ECONOMIC_APP_SECRET_TOKEN");
    }
    if (!swissAgreementGrantToken) {
      // @ts-ignore
      swissAgreementGrantToken = Deno.env.get("ECONOMIC_AGREEMENT_GRANT_TOKEN");
    }

    // Extract path and country from query parameters
    const url = new URL(req.url);
    const path = url.searchParams.get("path");
    const country = url.searchParams.get("country");
    
    if (!path || !country) {
      return new Response(
        JSON.stringify({ error: "Missing 'path' or 'country' query parameter." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let activeAppSecretToken;
    let activeAgreementGrantToken;

    if (country === 'Switzerland') {
      if (!swissAppSecretToken || !swissAgreementGrantToken) {
        return new Response(
          JSON.stringify({ error: "Missing Swiss e-conomic secrets." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      activeAppSecretToken = swissAppSecretToken;
      activeAgreementGrantToken = swissAgreementGrantToken;
    } else if (country === 'United Kingdom') {
      if (!ukAppSecretToken || !ukAgreementGrantToken) {
        return new Response(
          JSON.stringify({ error: "Missing UK e-conomic secrets." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      activeAppSecretToken = ukAppSecretToken;
      activeAgreementGrantToken = ukAgreementGrantToken;
    } else {
      return new Response(
        JSON.stringify({ error: `Unsupported country specified: ${country}.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseUrl = "https://restapi.e-conomic.com";
    const fullUrl = `${baseUrl}${path.startsWith("/") ? path : "/" + path}`;

    const headers: HeadersInit = {
      "X-AppSecretToken": activeAppSecretToken,
      "X-AgreementGrantToken": activeAgreementGrantToken,
      "User-Agent": "SupabaseEdge/1.0",
    };

    console.log(`[economic-pdf-proxy] Fetching PDF URL for ${country}: ${fullUrl}. Version: 1.0.4`);

    const response = await fetch(fullUrl, {
      method: "GET",
      headers: headers,
    });

    console.log(`[economic-pdf-proxy] e-conomic API response status: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[economic-pdf-proxy] Failed to fetch PDF. Status: ${response.status}, Body: ${errorBody.substring(0, 200)}`);
      
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

    const responseHeaders = new Headers(response.headers);
    const contentDisposition = responseHeaders.get('Content-Disposition') || 'inline; filename="invoice.pdf"';

    const finalHeaders = {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition,
        'Cache-Control': 'public, max-age=31536000',
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