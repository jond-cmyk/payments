// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

// @ts-ignore
serve(async (req) => {
  console.log("[economic-proxy] --- FUNCTION START (v1.0.23) ---");
  console.log("[economic-proxy] Request URL:", req.url);
  console.log("[economic-proxy] Request Method:", req.method);

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

    const rawBody = await req.text();
    console.log("[economic-proxy] Raw request body length:", rawBody.length);

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(rawBody);
    } catch (jsonParseError) {
      console.error("[economic-proxy] Failed to parse request body as JSON:", jsonParseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { path: rawPath, method = "GET", query: queryObj = {}, body, base, country } = parsedPayload;

    if (!rawPath || typeof rawPath !== "string") {
      console.error("[economic-proxy] Missing or invalid 'path' in request body.");
      return new Response(
        JSON.stringify({ error: "Missing 'path'. Example: '/self' or '/customers?pagesize=10'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!country) {
      console.error("[economic-proxy] Missing 'country' in request body.");
      return new Response(
        JSON.stringify({ error: "Missing 'country' in request body. Please specify 'Switzerland' or 'United Kingdom'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let activeAppSecretToken;
    let activeAgreementGrantToken;

    if (country === 'Switzerland') {
      if (!swissAppSecretToken || !swissAgreementGrantToken) {
        console.error("[economic-proxy] Missing Swiss e-conomic secrets.");
        return new Response(
          JSON.stringify({
            error:
              "Missing Swiss e-conomic secrets. Set SWISS_ECONOMIC_APP_SECRET_TOKEN and SWISS_ECONOMIC_AGREEMENT_GRANT_TOKEN (or the older names) in Supabase Secrets.",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      activeAppSecretToken = swissAppSecretToken;
      activeAgreementGrantToken = swissAgreementGrantToken;
    } else if (country === 'United Kingdom') {
      if (!ukAppSecretToken || !ukAgreementGrantToken) {
        console.error("[economic-proxy] Missing UK e-conomic secrets.");
        return new Response(
          JSON.stringify({
            error:
              "Missing UK e-conomic secrets. Set both ECONOMIC_APP_UK_SECRET_TOKEN and ECONOMIC_AGREEMENT_UK_GRANT_TOKEN in Supabase Secrets.",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      activeAppSecretToken = ukAppSecretToken;
      activeAgreementGrantToken = ukAgreementGrantToken;
    } else if (country === 'Ireland') {
      console.error("[economic-proxy] E-conomic for Ireland is not configured.");
      return new Response(
        JSON.stringify({
          error:
            "E-conomic integration for Ireland is not yet configured. Please add API secrets.",
        }),
        { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      console.error(`[economic-proxy] Unsupported country: ${country}`);
      return new Response(
        JSON.stringify({ error: `Unsupported country specified: ${country}. Supported countries are 'Switzerland' and 'United Kingdom'.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- NEW: Robust URL and Query Param Handling ---
    const [path, pathQueryString] = rawPath.split('?');
    const pathQueryParams = new URLSearchParams(pathQueryString || '');

    const finalQueryParams = new URLSearchParams(queryObj);
    pathQueryParams.forEach((value, key) => {
        finalQueryParams.append(key, value);
    });
    // --- End New Handling ---

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const baseUrl =
      typeof base === "string" && base.length > 0 ? base : "https://restapi.e-conomic.com";

    const qs = finalQueryParams.toString();
    const url = `${baseUrl}${normalizedPath}${qs ? '?' + qs : ''}`;

    const headers: HeadersInit = {
      "X-AppSecretToken": activeAppSecretToken,
      "X-AgreementGrantToken": activeAgreementGrantToken,
      "Accept": "application/json",
      "User-Agent": "SupabaseEdge/1.0",
    };

    const methodUpper = String(method).toUpperCase();
    const isGetLike = methodUpper === "GET" || methodUpper === "HEAD";

    const fetchOptions: RequestInit = {
      method: methodUpper,
      headers: isGetLike ? headers : { ...headers, "Content-Type": "application/json" },
      body: isGetLike ? undefined : body ? JSON.stringify(body) : undefined,
    };

    console.log(`[economic-proxy] Fetching URL for ${country}: ${url}`);
    console.log(`[economic-proxy] Fetch options: ${JSON.stringify({ method: fetchOptions.method, headers: fetchOptions.headers, body: fetchOptions.body ? '[body present]' : '[no body]' })}`);

    const response = await fetch(url, fetchOptions);
    const text = await response.text();

    console.log(`[economic-proxy] e-conomic API response status: ${response.status} ${response.statusText}`);
    console.log(`[economic-proxy] e-conomic API response body (first 500 chars): ${text.substring(0, 500)}`);

    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // keep as text
    }

    if (!response.ok) {
      console.error(`[economic-proxy] Non-2xx status detected: ${response.status}. Returning full error payload.`);
      return new Response(
        JSON.stringify({
          ok: response.ok,
          status: response.status,
          data: payload,
          error: `e-conomic API returned status ${response.status}`,
          request: {
            url,
            method: methodUpper,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: response.ok,
        status: response.status,
        data: payload,
        request: {
          url,
          baseUrl,
          path: normalizedPath,
          method: methodUpper,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error(`[economic-proxy] Unhandled error: ${error?.message || "Unknown error"}`, error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unexpected error calling e-conomic API." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});