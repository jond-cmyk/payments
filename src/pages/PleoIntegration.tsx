"use client";

import React, { useState } from "react";
import { useSession } from "@/integrations/supabase/SessionContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import PageTitle from "@/components/PageTitle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { showSuccess, showError, showLoading, dismissToast } from "@/utils/toast";
import { Globe } from "lucide-react";

const PleoIntegration = () => {
  const { session, isLoading, userProfile } = useSession();
  const navigate = useNavigate();
  const [endpointPath, setEndpointPath] = useState<string>("/me");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [requestBody, setRequestBody] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [base, setBase] = useState<string>("https://openapi.pleo.io");

  const isAdmin = userProfile?.role === "admin";

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }

  if (!session) {
    navigate("/login");
    return null;
  }

  if (!isAdmin) {
    showError("You do not have permission to view this page.");
    navigate("/dashboard");
    return null;
  }

  const handleCallPleo = async () => {
    const toastId = showLoading("Calling Pleo...");
    try {
      let parsedBody: any = undefined;
      if (method === "POST" && requestBody.trim()) {
        try {
          parsedBody = JSON.parse(requestBody);
        } catch {
          showError("Request body must be valid JSON.");
          dismissToast(toastId);
          return;
        }
      }

      const altBase =
        base === "https://openapi.pleo.io" ? "https://api.pleo.io" : "https://openapi.pleo.io";

      const normalized = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
      const versionless = normalized.replace(/^\/v[0-9]+/, "");

      // Build variant paths including common me endpoint forms
      const v1Prefixed = `/v1${versionless}`;
      const extraVariants: Array<{ path: string; label: string }> = [];
      if (versionless === "/me" || versionless.startsWith("/me")) {
        extraVariants.push({ path: "/users/me", label: "users/me (no version)" });
        extraVariants.push({ path: "/v1/users/me", label: "users/me (/v1)" });
      }

      const attempts = [
        { path: normalized, base, label: "selected base" },
        { path: normalized, base: altBase, label: "alternate base" },
        { path: versionless, base, label: "removed /v* on selected base" },
        { path: versionless, base: altBase, label: "removed /v* on alternate base" },
        { path: v1Prefixed, base, label: "added /v1 on selected base" },
        { path: v1Prefixed, base: altBase, label: "added /v1 on alternate base" },
        // extra heuristics for /me
        ...extraVariants.map(v => ({ path: v.path, base, label: `${v.label} on selected base` })),
        ...extraVariants.map(v => ({ path: v.path, base: altBase, label: `${v.label} on alternate base` })),
      ];

      let finalResp: { ok?: boolean; status?: number; data?: any; error?: string; request?: any } | null = null;
      let finalAttemptLabel = "";
      for (const a of attempts) {
        const { data, error } = await supabase.functions.invoke("pleo-proxy", {
          body: { path: a.path, method, body: parsedBody, base: a.base },
        });
        if (error) {
          finalResp = { ok: false, status: 500, data: null, error: error.message, request: { url: `${a.base}${a.path}`, baseUrl: a.base, path: a.path, method } };
          finalAttemptLabel = a.label;
          continue;
        }
        finalResp = data as any;
        finalAttemptLabel = a.label;
        if (!finalResp || finalResp.status !== 404) break;
      }

      setResult(JSON.stringify(finalResp, null, 2));

      if (!finalResp) {
        showError("No response from Pleo proxy.");
      } else if (finalResp.error) {
        showError(finalResp.error);
      } else if (finalResp.ok === false || (finalResp.status && finalResp.status >= 400)) {
        if (finalResp.status === 404) {
          showError("404 Not Found after trying alternate host and path variations.");
        } else {
          showError(`Pleo returned status ${finalResp.status}`);
        }
      } else {
        const expensesCount = Array.isArray(finalResp?.data?.expenses)
          ? finalResp.data.expenses.length
          : undefined;
        if (typeof expensesCount === "number") {
          showSuccess(`Fetched ${expensesCount} expenses (attempt: ${finalAttemptLabel}).`);
        } else {
          showSuccess(`Pleo response received (attempt: ${finalAttemptLabel}).`);
        }
      }

      dismissToast(toastId);
    } catch (e: any) {
      dismissToast(toastId);
      showError(e.message || "Failed to call Pleo API.");
      setResult(JSON.stringify({ error: e.message }, null, 2));
    }
  };

  const handleDiagnose = async () => {
    const toastId = showLoading("Diagnosing hosts and paths...");
    const altBase =
      base === "https://openapi.pleo.io" ? "https://api.pleo.io" : "https://openapi.pleo.io";

    const normalized = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
    const versionless = normalized.replace(/^\/v[0-9]+/, "");

    const v1Prefixed = `/v1${versionless}`;
    const extraVariants: Array<{ path: string; label: string }> = [];
    if (versionless === "/me" || versionless.startsWith("/me")) {
      extraVariants.push({ path: "/users/me", label: "users/me (no version)" });
      extraVariants.push({ path: "/v1/users/me", label: "users/me (/v1)" });
    }

    const combos = [
      { path: normalized, base, label: "selected base" },
      { path: normalized, base: altBase, label: "alternate base" },
      { path: versionless, base, label: "removed /v* on selected base" },
      { path: versionless, base: altBase, label: "removed /v* on alternate base" },
      { path: v1Prefixed, base, label: "added /v1 on selected base" },
      { path: v1Prefixed, base: altBase, label: "added /v1 on alternate base" },
      // extra heuristics for /me
      ...extraVariants.map(v => ({ path: v.path, base, label: `${v.label} on selected base` })),
      ...extraVariants.map(v => ({ path: v.path, base: altBase, label: `${v.label} on alternate base` })),
    ];

    const results: Array<{ label: string; status?: number; ok?: boolean; url: string; note?: string }> = [];
    for (const c of combos) {
      const { data, error } = await supabase.functions.invoke("pleo-proxy", {
        body: { path: c.path, method, base: c.base },
      });
      if (error) {
        results.push({ label: c.label, status: 500, ok: false, url: `${c.base}${c.path}`, note: error.message });
      } else {
        const r = data as any;
        results.push({ label: c.label, status: r?.status, ok: r?.ok, url: r?.request?.url || `${c.base}${c.path}` });
      }
    }

    setResult(JSON.stringify({ diagnose: results }, null, 2));
    dismissToast(toastId);

    const any200 = results.find((r) => r.status === 200 && r.ok === true);
    if (any200) {
      showSuccess(`Found a working combo: ${any200.label}`);
    } else {
      showError("No working combination found. Please confirm your token environment and endpoint paths with Pleo.");
    }
  };

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Pleo Integration - KH Payments" />
      <Card className="max-w-3xl mx-auto shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <Globe className="mr-2 h-6 w-6" /> Pleo OpenAPI Proxy
          </CardTitle>
          <CardDescription>
            Use this tool to test the secure proxy to Pleo. Defaults to <code>/me</code>. If 404 occurs, we now auto-try the alternate host and path variations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium">Base URL</label>
            <Input value={base} onChange={e => setBase(e.target.value)} />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Method</label>
            <div className="flex gap-2">
              <Button
                variant={method === "GET" ? "default" : "outline"}
                onClick={() => setMethod("GET")}
              >
                GET
              </Button>
              <Button
                variant={method === "POST" ? "default" : "outline"}
                onClick={() => setMethod("POST")}
              >
                POST
              </Button>
            </div>
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium">Endpoint Path</label>
            <Input value={endpointPath} onChange={e => setEndpointPath(e.target.value)} />
          </div>
          {method === "POST" && (
            <div>
              <label className="block mb-1 text-sm font-medium">Request Body (JSON)</label>
              <Textarea
                rows={4}
                placeholder="{}"
                value={requestBody}
                onChange={e => setRequestBody(e.target.value)}
              />
            </div>
          )}
          <div className="flex gap-4 flex-wrap">
            <Button onClick={handleCallPleo} className="flex-1">
              Call Pleo
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEndpointPath("/v1/me");
                setTimeout(handleCallPleo, 0);
              }}
            >
              Test /v1/me
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEndpointPath("/v1/expenses?limit=5");
                setTimeout(handleCallPleo, 0);
              }}
            >
              Test /v1/expenses
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEndpointPath("/me");
                setTimeout(handleCallPleo, 0);
              }}
            >
              Test /me
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEndpointPath("/expenses?limit=5");
                setTimeout(handleCallPleo, 0);
              }}
            >
              Test /expenses
            </Button>
            <Button variant="secondary" onClick={handleDiagnose}>
              Diagnose
            </Button>
          </div>
          {result && (
            <div>
              <label className="block mb-1 text-sm font-medium">Response</label>
              <Textarea rows={10} readOnly value={result} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PleoIntegration;