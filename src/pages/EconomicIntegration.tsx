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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { showSuccess, showError, showLoading, dismissToast } from "@/utils/toast";
import { Globe, Database } from "lucide-react"; // Import Database icon
import { useCountry } from "@/integrations/supabase/CountryContext";

const EconomicIntegration = () => {
  const { session, isLoading, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();

  const [endpointPath, setEndpointPath] = useState<string>("/self");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [requestBody, setRequestBody] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [base, setBase] = useState<string>("https://restapi.e-conomic.com");
  const [diagnoseAdvice, setDiagnoseAdvice] = useState<string>("");

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

  const handleCallEconomic = async () => {
    const toastId = showLoading("Calling e-conomic...");
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

      const normalized = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;

      const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path: normalized, method, body: parsedBody, base, country: currentCountry },
      });

      if (error) {
        showError(error.message || "Error invoking economic-api-proxy.");
        setResult(JSON.stringify({ error: error.message }, null, 2));
        dismissToast(toastId);
        return;
      }

      const resp = data as any;
      setResult(JSON.stringify(resp, null, 2));

      if (resp.error) {
        showError(resp.error);
      } else if (resp.status && resp.status >= 400) {
        if (resp.status === 401 || resp.status === 403) {
          setDiagnoseAdvice(
            "Received 401/403. Ensure ECONOMIC_APP_SECRET_TOKEN and ECONOMIC_AGREEMENT_GRANT_TOKEN are correctly set in Supabase Secrets and correspond to your e-conomic agreement."
          );
        } else if (resp.status === 404) {
          setDiagnoseAdvice(
            "Endpoint not found (404). Double-check the path. Common endpoints: /self, /customers, /invoices."
          );
        } else {
          setDiagnoseAdvice("");
        }
        showError(`e-conomic returned status ${resp.status}`);
      } else {
        setDiagnoseAdvice("");
        // Try to extract a meaningful summary
        const items = Array.isArray(resp?.data?.collection) ? resp.data.collection.length
          : Array.isArray(resp?.data) ? resp.data.length
          : undefined;
        if (typeof items === "number") {
          showSuccess(`Fetched ${items} items from e-conomic.`);
        } else {
          showSuccess(`e-conomic response received.`);
        }
      }

      dismissToast(toastId);
    } catch (e: any) {
      dismissToast(toastId);
      showError(e.message || "Failed to call e-conomic API.");
      setResult(JSON.stringify({ error: e.message }, null, 2));
    }
  };

  const handleDiagnose = async () => {
    const toastId = showLoading("Diagnosing common endpoints...");
    const tests = [
      { label: "Self", path: "/self" },
      { label: "Customers (5)", path: "/customers?pagesize=5" },
      { label: "Invoices (5)", path: "/invoices?pagesize=5" },
      { label: "Customer Ledger Entries (5)", path: "/customer-ledger-entries?pagesize=5" },
      { label: "Customer Ledger Items (5)", path: "/customer-ledger-items?pagesize=5" }, // Added back
      { label: "Dept. Profit/Loss (Demo)", path: "/accounting-reports/department-profit-loss?from=2023-01-01&to=2023-01-31" },
    ];

    const results: Array<{ label: string; status?: number; ok?: boolean; url: string; note?: string }> = [];

    for (const t of tests) {
      const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path: t.path, method: "GET", country: currentCountry },
      });
      if (error) {
        results.push({ label: t.label, status: 500, ok: false, url: `${base}${t.path}`, note: error.message });
      } else {
        const r = data as any;
        results.push({ label: t.label, status: r?.status, ok: r?.ok, url: r?.request?.url || `${base}${t.path}` });
      }
    }

    setResult(JSON.stringify({ diagnose: results }, null, 2));
    dismissToast(toastId);

    const workingLedger = results.find(r => r.label.includes('Ledger') && r.status === 200 && r.ok === true);
    const any200 = results.find((r) => r.status === 200 && r.ok === true);

    if (workingLedger) {
      showSuccess(`Working: ${workingLedger.label}`);
      setDiagnoseAdvice(`Ledger endpoint found: ${workingLedger.label}. The Customers page should now work.`);
    } else if (any200) {
      showSuccess(`Working: ${any200.label}`);
      setDiagnoseAdvice("Basic endpoints are working, but ledger and reports are failing 404. This suggests your e-conomic agreement may not have access to these specific features.");
    } else {
      showError("No working combination found.");
      setDiagnoseAdvice(
        "Check that secrets ECONOMIC_APP_SECRET_TOKEN and ECONOMIC_AGREEMENT_GRANT_TOKEN are set correctly for your e-conomic agreement, and that your account has API access."
      );
    }
  };

  const handleMigrateStandingOrderComments = async () => {
    const toastId = showLoading("Migrating standing order comments...");
    try {
      const { data, error } = await supabase.rpc('migrate_standing_order_comments_to_audits');

      if (error) {
        throw new Error(error.message);
      }

      dismissToast(toastId);
      showSuccess(data || "Standing order comments migration initiated.");
      // You might want to invalidate relevant queries here if the UI needs to reflect changes immediately
      // queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
      // queryClient.invalidateQueries({ queryKey: ['standingOrderAudits'] });
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to migrate standing order comments.");
      console.error("Migration error:", error);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Visma e-conomic Integration - KH Payments" />
      {diagnoseAdvice && (
        <Alert className="mb-4">
          <AlertTitle>Diagnostic advice</AlertTitle>
          <AlertDescription>{diagnoseAdvice}</AlertDescription>
        </Alert>
      )}
      <Card className="max-w-3xl mx-auto shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <Globe className="mr-2 h-6 w-6" /> e-conomic REST API Proxy
          </CardTitle>
          <CardDescription>
            Test the secure proxy to e-conomic. Defaults to <code>/self</code>. For lists, try <code>/customers?pagesize=5</code> or <code>/invoices?pagesize=5</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium">Base URL</label>
            <Input value={base} onChange={(e) => setBase(e.target.value)} />
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
            <Input value={endpointPath} onChange={(e) => setEndpointPath(e.target.value)} />
          </div>
          {method === "POST" && (
            <div>
              <label className="block mb-1 text-sm font-medium">Request Body (JSON)</label>
              <Textarea
                rows={4}
                placeholder="{}"
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
              />
            </div>
          )}
          <div className="flex gap-4 flex-wrap">
            <Button onClick={handleCallEconomic} className="flex-1">
              Call e-conomic
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEndpointPath("/self");
                setTimeout(handleCallEconomic, 0);
              }}
            >
              Test /self
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEndpointPath("/customers?pagesize=5");
                setTimeout(handleCallEconomic, 0);
              }}
            >
              Test /customers
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEndpointPath("/invoices?pagesize=5");
                setTimeout(handleCallEconomic, 0);
              }}
            >
              Test /invoices
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

      {/* NEW: Standing Order Comments Migration Card */}
      <Card className="max-w-3xl mx-auto shadow-sm mt-8 border-l-4 border-blue-500">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold text-blue-700">
            <Database className="mr-2 h-6 w-6" /> Standing Order Comments Migration
          </CardTitle>
          <CardDescription>
            This utility will migrate existing comments from the old 'comments' field in standing orders to the new audit trail system.
            This is a one-time operation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleMigrateStandingOrderComments}
            disabled={false} // Enable this button for the one-off migration
            className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            Run Comments Migration
          </Button>
          <p className="text-sm text-muted-foreground mt-2">
            Clicking this will move all non-empty 'comments' from the `standing_orders` table to `standing_order_audits` and then clear the original field.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default EconomicIntegration;