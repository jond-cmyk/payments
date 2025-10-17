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
  const [endpointPath, setEndpointPath] = useState<string>("/v1/me");
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
        } catch (e) {
          showError("Request body must be valid JSON.");
          dismissToast(toastId);
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke("pleo-proxy", {
        body: {
          path: endpointPath,
          method,
          body: parsedBody,
          base,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      setResult(JSON.stringify(data, null, 2));

      const resp = data as { ok?: boolean; status?: number; data?: unknown; error?: string };
      if (resp?.error) {
        showError(resp.error);
      } else if (resp?.ok === false || (resp?.status && resp.status >= 400)) {
        showError(`Pleo returned status ${resp.status}`);
      } else {
        showSuccess("Pleo response received!");
      }
      dismissToast(toastId);
    } catch (e: any) {
      dismissToast(toastId);
      showError(e.message || "Failed to call Pleo API.");
      setResult(JSON.stringify({ error: e.message }, null, 2));
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
            Use this tool to test the secure proxy to Pleo. Defaults to <code>/v1/me
          </CardDescription>
        </CardHeader>
        <CardContent>
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
          </div>

          <p className="text-xs text-muted-foreground">
            If you see 404, your token may be tied to a different API version or region. Try the quick test buttons above or contact Pleo support to confirm the correct base URL and paths for your API token.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PleoIntegration;