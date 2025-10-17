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
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      setResult(JSON.stringify(data, null, 2));
      showSuccess("Pleo response received!");
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
            Use this tool to test the secure proxy to Pleo. Defaults to <code>/v1/me</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Endpoint Path</label>
              <Input
                value={endpointPath}
                onChange={(e) => setEndpointPath(e.target.value)}
                placeholder="/v1/me or /v1/expenses?limit=10"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Method</label>
              <select
                className="w-full border rounded-md h-10 px-3 bg-background"
                value={method}
                onChange={(e) => setMethod(e.target.value as "GET" | "POST")}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
          </div>

          {method === "POST" && (
            <div>
              <label className="text-sm font-medium">Request Body (JSON)</label>
              <Textarea
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                placeholder='{"example":"value"}'
                className="min-h-[120px]"
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleCallPleo} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm">
              Test Pleo Connection
            </Button>
          </div>

          <div>
            <label className="text-sm font-medium">Response</label>
            <Textarea
              value={result}
              readOnly
              className="min-h-[240px] font-mono text-xs"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Tip: Once verified, we can automate importing Pleo expenses into your Transactions table.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PleoIntegration;