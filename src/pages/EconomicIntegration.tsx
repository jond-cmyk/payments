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
import { showSuccess, showError, showLoading, dismissToast, showInfo } from "@/utils/toast";
import { Globe, Database, Compass, CalendarDays } from "lucide-react";
import { useCountry } from "@/integrations/supabase/CountryContext";
import DatePicker from "@/components/DatePicker";
import { format, isWithinInterval, parseISO } from "date-fns";
import EconomicDetailDialog, { DialogColumn, extractList } from "@/components/economic/EconomicDetailDialog";

type EconomicProxyResponse<T = any> = {
  ok?: boolean;
  status?: number;
  data?: T;
  request?: { url?: string };
  error?: string;
};

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

  // NEW STATES for Ledger Lookup
  const [ledgerStartDate, setLedgerStartDate] = useState<Date | undefined>(new Date('2025-10-01'));
  const [ledgerEndDate, setLedgerEndDate] = useState<Date | undefined>(new Date('2025-10-31'));
  const [isLedgerLoading, setIsLedgerLoading] = useState(false);
  const [ledgerResult, setLedgerResult] = useState<any[] | null>(null);
  const [showLedgerDialog, setShowLedgerDialog] = useState(false);

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

  const handleCallEconomic = async (pathOverride?: string) => {
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

      const path = pathOverride || endpointPath;
      const normalized = path.startsWith("/") ? path : `/${path}`;

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
      { label: "Customer Ledger Items (5)", path: "/customer-ledger-items?pagesize=5" },
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
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to migrate standing order comments.");
      console.error("Migration error:", error);
    }
  };

  const handleFetchLedger = async () => {
    if (!ledgerStartDate || !ledgerEndDate) {
      showError("Please select both start and end dates.");
      return;
    }

    setIsLedgerLoading(true);
    setLedgerResult(null);
    const toastId = showLoading(`Fetching ledger entries for ${format(ledgerStartDate, 'MMM yyyy')}...`);

    try {
      const startDateStr = format(ledgerStartDate, 'yyyy-MM-dd');
      const endDateStr = format(ledgerEndDate, 'yyyy-MM-dd');
      
      // 1. Fetch all accounting years
      const { data: yearsData, error: yearsError } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path: "/accounting-years", method: "GET", country: currentCountry },
      });

      if (yearsError) throw new Error(yearsError.message);
      const yearsResp = yearsData as EconomicProxyResponse<any>;
      if (yearsResp.error || !yearsResp.ok) {
        throw new Error(yearsResp.error || `Failed to fetch accounting years: Status ${yearsResp.status}`);
      }
      const accountingYears = extractList(yearsResp?.data);
      
      if (!accountingYears || accountingYears.length === 0) {
        showError("No accounting years found in e-conomic. Cannot fetch entries.");
        dismissToast(toastId);
        return;
      }

      let allEntries: any[] = [];
      const dateRange = { start: ledgerStartDate, end: ledgerEndDate };

      // 2. Iterate through years and query relevant ones
      const fetchPromises = accountingYears.map(async (yearInfo: any) => {
        const yearStart = parseISO(yearInfo.fromDate);
        const yearEnd = parseISO(yearInfo.toDate);
        
        // Check if the accounting year overlaps with the requested date range
        const overlaps = isWithinInterval(yearStart, dateRange) || 
                         isWithinInterval(yearEnd, dateRange) ||
                         (yearStart < dateRange.start && yearEnd > dateRange.end);

        if (overlaps) {
          // Construct the filter to constrain the results to the exact requested range
          const filter = `date$gte:${startDateStr}$and:date$lte:${endDateStr}`;
          const path = `/accounting-years/${yearInfo.year}/entries?pagesize=1000&filter=${filter}`;
          
          const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
            body: { path, method: "GET", country: currentCountry },
          });

          if (error) {
            console.error(`Error fetching entries for year ${yearInfo.year}:`, error.message);
            return [];
          }

          const resp = data as EconomicProxyResponse<any>;
          if (resp.error || !resp.ok) {
            console.error(`e-conomic error fetching entries for year ${yearInfo.year}:`, resp.error || `Status ${resp.status}`);
            return [];
          }
          
          return extractList(resp?.data);
        }
        return [];
      });

      const results = await Promise.all(fetchPromises);
      allEntries = results.flat();

      setLedgerResult(allEntries);
      setShowLedgerDialog(true);

      if (allEntries.length > 0) {
        showSuccess(`Found ${allEntries.length} ledger entries for the period.`);
      } else {
        showInfo("No ledger entries found for the specified period.");
      }

    } catch (e: any) {
      showError(e.message || "Failed to fetch ledger entries.");
      setLedgerResult(null);
    } finally {
      dismissToast(toastId);
      setIsLedgerLoading(false);
    }
  };

  // Define columns for the Ledger Dialog
  const ledgerColumns: DialogColumn[] = [
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'entryDate'] },
    { key: 'entryNumber', header: 'Entry No.', path: ['entryNumber', 'number', 'id'] },
    { key: 'entryType', header: 'Entry Type', path: ['entryType', 'type'] },
    { key: 'text', header: 'Text', path: ['text', 'description', 'notes.text'] },
    { key: 'account', header: 'Account', path: ['account.accountNumber'] },
    { key: 'amount', header: 'Amount', format: 'currencyAmount', path: ['amount', 'amount.value', 'totalAmount', 'grossAmount'] },
    { key: 'currency', header: 'Currency', path: ['currency', 'currency.code'] },
    { key: 'remainder', header: 'Outstanding', format: 'currencyAmount', path: ['remainder'] },
  ];

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Visma e-conomic Integration - KH Payments" />
      {diagnoseAdvice && (
        <Alert className="mb-4">
          <AlertTitle>Diagnostic advice</AlertTitle>
          <AlertDescription>{diagnoseAdvice}</AlertDescription>
        </Alert>
      )}
      
      {/* NEW: Ledger Lookup Card */}
      <Card className="max-w-3xl mx-auto shadow-sm mb-8 border-l-4 border-green-500">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold text-green-700">
            <CalendarDays className="mr-2 h-6 w-6" /> Ledger Entries Lookup
          </CardTitle>
          <CardDescription>
            Fetch general ledger entries for a specific date range (max 1000 entries per year).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-sm font-medium">Start Date</label>
              <DatePicker 
                date={ledgerStartDate} 
                setDate={setLedgerStartDate} 
                placeholder="Start Date" 
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">End Date</label>
              <DatePicker 
                date={ledgerEndDate} 
                setDate={setLedgerEndDate} 
                placeholder="End Date" 
              />
            </div>
          </div>
          <Button onClick={handleFetchLedger} disabled={isLedgerLoading || !ledgerStartDate || !ledgerEndDate} className="w-full bg-green-600 hover:bg-green-700 text-white shadow-sm">
            {isLedgerLoading ? "Fetching Ledger..." : "Fetch Ledger Entries"}
          </Button>
        </CardContent>
      </Card>

      {/* Existing: API Proxy Card */}
      <Card className="max-w-3xl mx-auto shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <Globe className="mr-2 h-6 w-6" /> e-conomic REST API Proxy
          </CardTitle>
          <CardDescription>
            Test the secure proxy to e-conomic. Use the "Discover Endpoints" button to find available routes for your account.
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
            <Button onClick={() => handleCallEconomic()} className="flex-1">
              Call e-conomic
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleCallEconomic('/')}
              className="flex items-center gap-2"
            >
              <Compass className="h-4 w-4" /> Discover Endpoints
            </Button>
            <Button variant="secondary" onClick={handleDiagnose}>
              Diagnose Common Endpoints
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

      {/* Existing: Standing Order Comments Migration Card */}
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
            disabled={false}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            Run Comments Migration
          </Button>
          <p className="text-sm text-muted-foreground mt-2">
            Clicking this will move all non-empty 'comments' from the `standing_orders` table to `standing_order_audits` and then clear the original field.
          </p>
        </CardContent>
      </Card>

      {/* Ledger Detail Dialog */}
      <EconomicDetailDialog 
        isOpen={showLedgerDialog} 
        onOpenChange={setShowLedgerDialog} 
        title={`Ledger Entries: ${format(ledgerStartDate || new Date(), 'PPP')} - ${format(ledgerEndDate || new Date(), 'PPP')}`} 
        description={`Showing ledger entries for the selected period in ${currentCountry}.`} 
        data={ledgerResult} 
        columns={ledgerColumns} 
        isLoading={isLedgerLoading} 
        defaultSort={{ key: 'date', direction: 'descending' }} 
      />
    </div>
  );
};

export default EconomicIntegration;