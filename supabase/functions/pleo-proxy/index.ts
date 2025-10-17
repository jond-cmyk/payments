import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("PLEO_API_TOKEN");
    if (!token) {
      return new Response(
        JSON.stringify({ error: "PLEO_API_TOKEN is not set. Please configure it in Supabase Secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { path, method = "GET", query = {}, body } = await req.json().catch(() => ({}));

    if (!path || typeof path !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'path'. Example: '/v1/me' or '/v1/expenses?limit=10'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    // Build query string from provided query object (if any)
    const qs =
      query && typeof query === "object" && Object.keys(query).length
        ? "?" + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()
        : "";

    const url = `https://openapi.pleo.io${normalizedPath}${qs}`;

    const headers: HeadersInit = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    };

    // Only send JSON body for non-GET methods
    const fetchOptions: RequestInit = {
      method,
      headers: method === "GET" ? headers : { ...headers, "Content-Type": "application/json" },
      body: method === "GET" ? undefined : body ? JSON.stringify(body) : undefined,
    };

    const response = await fetch(url, fetchOptions);
    const text = await response.text();

    // Try to forward JSON, otherwise pass raw text
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      // leave as text if not valid JSON
    }

    return new Response(JSON.stringify({ status: response.status, data: payload }), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Unexpected error calling Pleo API." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});