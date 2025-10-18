// @ts-ignore
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

serve(async (req) => {
  console.log("[economic-proxy] --- FUNCTION START ---"); // NEW: Very first log
  console.log("[economic-proxy] Request URL:", req.url);
  console.log("[economic-proxy] Request Method:", req.method);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[economic-proxy] Edge Function invoked. Version: 1.0.9"); // Updated version to trigger redeployment
    console.log("[economic-proxy] Incoming request headers:", JSON.stringify(Object.fromEntries(req.headers.entries()), null, 2));

    const rawBody = await req.text();
    console.log("[economic-proxy] Raw request body:", rawBody);

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(rawBody);
      console.log("[economic-proxy] Parsed request body:", JSON.stringify(parsedPayload, null, 2));
    } catch (jsonParseError) {
      console.error("[economic-proxy] Failed to parse request body as JSON:", jsonParseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // NEW: Specific check for the problematic payload
    if (parsedPayload && typeof parsedPayload === 'object' && parsedPayload.name === 'Functions' && Object.keys(parsedPayload).length === 1) {
      console.error("[economic-proxy] Received generic 'Functions' payload. This indicates an incorrect invocation or missing body from the client.");
      return new Response(
        JSON.stringify({
          error: "Incorrect invocation payload. The client did not send the expected 'path' and 'method' in the request body. Please ensure the client-side `supabase.functions.invoke` call is correctly structured.",
          receivedPayload: parsedPayload,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // @ts-ignore
    const appSecretToken = Deno.env.get("ECONOMIC_APP_SECRET_TOKEN");
    // @ts-ignore
    const agreementGrantToken = Deno.env.get("ECONOMIC_AGREEMENT_GRANT_TOKEN");

    if (!appSecretToken || !agreementGrantToken) {
      console.error("[economic-proxy] Missing ECONOMIC_APP_SECRET_TOKEN or ECONOMIC_AGREEMENT_GRANT_TOKEN.");
      return new Response(
        JSON.stringify({
          error:
            "Missing ECONOMIC_APP_SECRET_TOKEN or ECONOMIC_AGREEMENT_GRANT_TOKEN. Set both in Supabase → Edge Functions → Manage Secrets.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { path, method = "GET", query = {}, body, base } = parsedPayload;

    if (!path || typeof path !== "string") {
      console.error("[economic-proxy] Missing or invalid 'path' in request body. Parsed payload:", JSON.stringify(parsedPayload, null, 2));
      return new Response(
        JSON.stringify({ error: "Missing 'path'. Example: '/self' or '/customers?pagesize=10'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const baseUrl =
      typeof base === "string" && base.length > 0 ? base : "https://restapi.e-conomic.com";

    const qs =
      query && typeof query === "object" && Object.keys(query).length
        ? "?" + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()
        : "";

    const url = `${baseUrl}${normalizedPath}${qs}`;

    const headers: HeadersInit = {
      "X-AppSecretToken": appSecretToken,
      "X-AgreementGrantToken": agreementGrantToken,
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

    console.log(`[economic-proxy] Fetching URL: ${url}`);
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
      { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error(`[economic-proxy] Unhandled error: ${error?.message || "Unknown error"}`, error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unexpected error calling e-conomic API." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});