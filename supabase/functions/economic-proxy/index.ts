import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const appSecretToken = Deno.env.get("ECONOMIC_APP_SECRET_TOKEN");
    const agreementGrantToken = Deno.env.get("ECONOMIC_AGREEMENT_GRANT_TOKEN");

    if (!appSecretToken || !agreementGrantToken) {
      return new Response(
        JSON.stringify({
          error:
            "Missing ECONOMIC_APP_SECRET_TOKEN or ECONOMIC_AGREEMENT_GRANT_TOKEN. Set both in Supabase → Edge Functions → Manage Secrets.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { path, method = "GET", query = {}, body, base } = await req.json().catch(() => ({}));

    if (!path || typeof path !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'path'. Example: '/self' or '/customers?pagesize=10'." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const baseUrl =
      typeof base === "string" && base.length > 0 ? base : "https://restapi.e-conomic.com";

    // Build query string from provided query object
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

    const response = await fetch(url, fetchOptions);
    const text = await response.text();

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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Unexpected error calling e-conomic API." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});