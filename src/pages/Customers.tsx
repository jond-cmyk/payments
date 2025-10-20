"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import PageTitle from "@/components/PageTitle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/integrations/supabase/SessionContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { showError, showLoading, showSuccess, dismissToast } from "@/utils/toast";
import { List, FileText, BookText } from "lucide-react";
import EconomicDetailDialog, { DialogColumn, extractList } from "@/components/economic/EconomicDetailDialog";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatAmount } from "@/components/economic/EconomicDetailDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type EconomicProxyResponse<T = any> = {
  ok?: boolean;
  status?: number;
  data?: T;
  request?: { url?: string };
  error?: string;
};

type EconomicCollection<T = any> = {
  collection?: T[];
  pagination?: any;
  message?: string; // Added for error handling
  developerHint?: string; // Added for error handling
};

type EconomicCustomer = {
  customerNumber?: number;
  name?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    postalCode?: string;
    city?: string;
  };
  currency?: string;
  self?: string;
  [key: string]: any;
};

// Helper to pick a value from an object given multiple possible keys/paths
const pick = (obj: any, keys: string[]): any => {
  if (!obj) return undefined;
  for (const key of keys) {
    const parts = key.split('.');
    let current = obj;
    let found = true;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        current = undefined;
        found = false;
        break;
      }
    }
    if (found) {
      if (typeof current === "object" && current !== null && "value" in current && typeof current.value === "number") {
        return current.value;
      }
      if (typeof current === "string" && !isNaN(parseFloat(current))) {
        return parseFloat(current);
      }
      return current;
    }
  }
  return undefined;
};


const Customers: React.FC = () => {
  const { session, isLoading } = useSession();
  const navigate = useNavigate();

  const [pageSize, setPageSize] = useState<string>("25");
  const [search, setSearch] = useState<string>("");

  const customersQuery = useQuery({
    queryKey: ["economicCustomers", pageSize],
    queryFn: async () => {
      const path = `/customers?pagesize=${pageSize}`;
      console.log(`[Customers] Invoking economic-proxy for path: ${path}`);
      const { data, error } = await supabase.functions.invoke("economic-proxy", {
        body: { path: path, method: "GET" },
      });
      console.log("[Customers] Raw response from economic-proxy:", { data, error });
      if (error) throw new Error(error.message || "Failed to load customers");
      const resp = data as EconomicProxyResponse<EconomicCollection<EconomicCustomer>>;
      const list = extractList(resp?.data);
      console.log("[Customers] Extracted list from response:", list);
      return list as EconomicCustomer[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customersQuery.data || [];
    return (customersQuery.data || []).filter((c) => {
      const fields = [
        String(c.customerNumber || ""),
        c.name || "",
        c.email || "",
        c.address?.street || "",
        c.address?.postalCode || "",
        c.address?.city || "",
      ].map((s) => s.toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [customersQuery.data, search]);

  console.log("Customers Page State:", {
    isLoading: isLoading,
    customersQueryLoading: customersQuery.isLoading,
    customersDataLength: customersQuery.data?.length,
    filteredLength: filtered.length,
  });
  console.log("[Customers] Component rendered. customersQuery.data:", customersQuery.data?.map(c => ({ num: c.customerNumber, name: c.name })));

  if (isLoading || customersQuery.isLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading customers...</div>;
  }
  if (!session) {
    navigate("/login");
    return null;
  }

  if (customersQuery.error) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading customers: {customersQuery.error.message}</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Customers - e-conomic" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <List className="mr-2 h-6 w-6" /> Customers
          </CardTitle>
          <CardDescription>View customers from e-conomic, search, and inspect balances and invoices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[220px]">
              <Input
                placeholder="Search by name, number, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-[160px]">
              <Select value={pageSize} onValueChange={setPageSize}>
                <SelectTrigger>
                  <SelectValue placeholder="Page size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => customersQuery.refetch()}
              disabled={customersQuery.isFetching}
            >
              Refresh
            </Button>
          </div>

          <div className="relative overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow><TableHead className="w-24">Number</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Currency</TableHead><TableHead>Balance</TableHead><TableHead>Overdue</TableHead><TableHead className="w-64">Actions</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <CustomerRow 
                    key={c.customerNumber ?? c.name} 
                    customer={c} 
                  />
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      {customersQuery.isFetching ? "Loading customers..." : "No customers found."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

interface CustomerRowProps {
  customer: EconomicCustomer;
}

const CustomerRow: React.FC<CustomerRowProps> = ({ customer }) => {
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any[] | null>(null);

  const [ledgerCardData, setLedgerCardData] = useState<any[] | null>(null);
  const [loadingLedgerCard, setLoadingLedgerCard] = useState(false);
  const [showLedgerCardDialog, setShowLedgerCardDialog] = useState(false);

  const [showInvoicesDialog, setShowInvoicesDialog] = useState(false);

  const [invoiceHeadings, setInvoiceHeadings] = useState<Record<string, string>>({});

  const num = customer.customerNumber;

  console.log("CustomerRow Props for customer:", customer.customerNumber, {
    customerNumber: customer.customerNumber,
    loadingInvoices: loadingInvoices,
    loadingLedgerCard: loadingLedgerCard,
  });

  // Fetch balance and overdue amount automatically using useQuery
  const { data: balanceData, isLoading: loadingBalance, error: balanceError } = useQuery<{ balance: number | null, dueAmount: number | null }>({
    queryKey: ["customerBalanceAndOverdue", num],
    queryFn: async () => {
      if (!num) return { balance: null, dueAmount: null };
      const { data, error } = await supabase.functions.invoke("economic-proxy", {
        body: { path: `/customers/${num}/totals`, method: "GET" },
      });

      if (error) {
        console.error("Failed to load balance/overdue:", error);
        throw new Error(error.message || "Failed to load balance/overdue");
      }

      const resp = data as EconomicProxyResponse<any>;

      const getNumeric = (obj: any, keys: string[]): number | null => {
        for (const k of keys) {
          const v = pick(obj, [k]);
          if (typeof v === "number") return v;
        }
        return null;
      };

      let balanceVal = getNumeric(resp?.data, ["balance", "totals.balance", "outstandingAmount", "openEntriesAmount"]) ?? null;
      let dueAmountVal = getNumeric(resp?.data, ["dueAmount", "totals.dueAmount"]) ?? null;

      if (balanceVal === null || dueAmountVal === null) {
        const { data: detailsData, error: detailsError } = await supabase.functions.invoke("economic-proxy", {
          body: { path: `/customers/${num}`, method: "GET" },
        });
        if (!detailsError) {
          const detailsResp = detailsData as EconomicProxyResponse<any>;
          balanceVal = balanceVal ?? (getNumeric(detailsResp?.data, ["balance", "outstandingAmount", "openEntriesAmount"]) ?? null);
          dueAmountVal = dueAmountVal ?? (getNumeric(detailsResp?.data, ["dueAmount"]) ?? null);
        }
      }
      return { balance: balanceVal, dueAmount: dueAmountVal };
    },
    enabled: !!num,
    staleTime: 5 * 60 * 1000,
  });

  const { balance, dueAmount } = balanceData || { balance: null, dueAmount: null };

  const pathFromSelf = (self: string): string | undefined => {
    if (typeof self !== "string" || !self) return undefined;
    if (self.startsWith("http")) {
      const parts = self.split("/");
      if (parts.length >= 4) {
        return "/" + parts.slice(3).join("/");
      }
      return "/" + parts.slice(3).join("/");
    }
    if (self.startsWith("/")) return self;
    return "/" + self;
  };

  const getInvoiceKey = (inv: any): string => {
    if (inv?.self) return String(inv.self);
    if (inv?.bookedInvoiceNumber) return `booked:${inv.bookedInvoiceNumber}`;
    if (inv?.invoiceNumber) return `invoice:${inv.invoiceNumber}`;
    if (inv?.id) return `id:${inv.id}`;
    return JSON.stringify(inv);
  };

  const getInvoiceDescription = useCallback((inv: any): string => {
    const candidates = [
      inv?.description,
      inv?.text,
      inv?.notes?.text,
      inv?.notes?.heading,
      inv?.notes?.header,
      inv?.notes?.noteHeading,
      inv?.heading,
      inv?.title,
      inv?.header,
      inv?.recipient?.name,
      inv?.customer?.name,
    ];

    for (const c of candidates) {
      if (typeof c === "string" && c.trim() !== "") {
        return c;
      }
    }
    return "-";
  }, []);

  const fetchHeadingForInvoice = useCallback(async (inv: any) => {
    const path =
      pathFromSelf(inv?.self) ??
      (inv?.bookedInvoiceNumber ? `/invoices/booked/${inv.bookedInvoiceNumber}` : undefined);
    if (!path) return;

    const { data, error } = await supabase.functions.invoke("economic-proxy", {
      body: { path, method: "GET" },
    });
    if (error || !data) return;

    const root = (data as any)?.data ?? data;

    const candidates = [
      root?.notes?.heading,
      root?.notes?.header,
      root?.notes?.noteHeading,
      root?.heading,
      root?.title,
      root?.header,
      root?.description,
      root?.text,
      root?.recipient?.name,
      root?.customer?.name,
    ];

    let found: string | undefined;
    for (const c of candidates) {
      if (typeof c === "string" && c.trim() !== "") {
        found = c;
        break;
      }
    }

    if (!found && root?.references) {
      const refs = root.references;
      const refCandidates = [refs?.heading, refs?.other, refs?.text, refs?.note];
      for (const c of refCandidates) {
        if (typeof c === "string" && c.trim() !== "") {
          found = c;
          break;
        }
      }
    }

    if (!found && inv?.orderNumber) {
      found = `Order #${inv.orderNumber}`;
    }
    
    if (!found) {
      found = getInvoiceDescription(root);
    }

    if (!found || found === "-") return;

    const key = getInvoiceKey(inv);
    setInvoiceHeadings((prev) => ({ ...prev, [key]: found as string }));
  }, [getInvoiceDescription, setInvoiceHeadings]);

  const enrichInvoiceHeadings = useCallback(async (list: any[]) => {
    for (const inv of list) {
      const key = getInvoiceKey(inv);
      if (!invoiceHeadings[key]) {
        const basic = getInvoiceDescription(inv);
        if (basic && basic !== "-") {
          setInvoiceHeadings((prev) => ({ ...prev, [key]: basic }));
        } else {
          fetchHeadingForInvoice(inv);
        }
      }
    }
  }, [invoiceHeadings, getInvoiceDescription, fetchHeadingForInvoice]);

  const handleUnauthorized = useCallback(async (economicErrorResponse: any, originalRequestPath: string): Promise<boolean> => {
    const demoLink = economicErrorResponse?.demoLink;
    if (typeof demoLink === "string" && demoLink.trim() !== "") {
      try {
        window.open(demoLink, "_blank");
        showSuccess("Opening demo invoice PDF");
        return true;
      } catch (e) {
        console.error("Failed to open demoLink:", e);
      }
    }

    if (originalRequestPath) {
      const { data: demoData } = await supabase.functions.invoke("economic-proxy", {
        body: { path: `${originalRequestPath}?demo=true`, method: "GET" },
      });
      if (demoData) {
        const demoResp = demoData as any;
        const demoRoot = demoResp?.data ?? demoData;
        const demoCandidates = [demoRoot?.url, demoRoot?.href, demoRoot?.download, demoRoot?.downloadUrl, demoRoot?.link];
        let demoPdfUrl: string | undefined;
        for (const c of demoCandidates) {
          if (typeof c === "string" && c.trim() !== "") {
            demoPdfUrl = c;
            break;
          }
        }
        if (demoPdfUrl) {
          try {
            window.open(demoPdfUrl, "_blank");
            showSuccess("Opening demo invoice PDF");
            return true;
          } catch (e) {
            console.error("Failed to open ?demo=true PDF URL:", e);
          }
        }
      }
    }

    showError("Unauthorized to access invoice PDF. Check ECONOMIC_APP_SECRET_TOKEN and ECONOMIC_AGREEMENT_GRANT_TOKEN in Supabase Secrets.");
    return false;
  }, []);

  const viewInvoice = useCallback(async (inv: any) => {
    const toastId = showLoading("Fetching invoice...");
    const basePath =
      pathFromSelf(inv?.self) ??
      (inv?.bookedInvoiceNumber
        ? `/invoices/booked/${inv.bookedInvoiceNumber}`
        : inv?.invoiceNumber
        ? `/invoices/${inv.invoiceNumber}`
        : undefined);

    if (!basePath) {
      dismissToast(toastId);
      showError("Invoice path not available");
      return;
    }

    const { data: initialProxyResponse, error: initialProxyError } = await supabase.functions.invoke("economic-proxy", {
      body: { path: basePath, method: "GET" },
    });
    dismissToast(toastId);

    if (initialProxyError) {
      showError(initialProxyError.message || "Failed to fetch invoice details via proxy.");
      return;
    }

    const initialEconomicResponse = initialProxyResponse as any;
    const initialRoot = initialEconomicResponse?.data ?? initialProxyResponse;
    const economicHttpStatus = initialRoot?.httpStatusCode || initialRoot?.status;

    if (economicHttpStatus === 401) {
      const handled = await handleUnauthorized(initialRoot, basePath);
      if (handled) return;
      return;
    }

    let pdfUrl: string | undefined;
    const candidates = [
      initialRoot?.pdf,
      initialRoot?.pdf?.url,
      initialRoot?.pdf?.href,
      initialRoot?.pdf?.download,
      initialRoot?.pdf?.downloadUrl,
      initialRoot?.links?.pdf,
      initialRoot?.links?.pdf?.href,
    ];

    for (const c of candidates) {
      if (typeof c === "string" && c.trim() !== "") {
        pdfUrl = c;
        break;
      }
    }

    if (!pdfUrl && typeof initialRoot?.pdf === "object" && initialRoot?.pdf) {
      for (const val of Object.values(initialRoot.pdf)) {
        if (typeof val === "string" && val.trim() !== "") {
          pdfUrl = val as string;
          break;
        }
      }
    }

    if (!pdfUrl) {
      const pdfPath = basePath.endsWith("/pdf") ? basePath : `${basePath}/pdf`;
      const { data: pdfProxyResponse, error: pdfProxyError } = await supabase.functions.invoke("economic-proxy", {
        body: { path: pdfPath, method: "GET" },
      });

      if (pdfProxyError) {
        showError(pdfProxyError.message || "Failed to fetch PDF subresource via proxy.");
        return;
      }

      const pdfEconomicResponse = pdfProxyResponse as any;
      const pdfRoot = pdfEconomicResponse?.data ?? pdfProxyResponse;
      const pdfEconomicHttpStatus = pdfRoot?.httpStatusCode || pdfRoot?.status;

      if (pdfEconomicHttpStatus === 401) {
        const handled = await handleUnauthorized(pdfRoot, pdfPath);
        if (handled) return;
        return;
      }

      const moreCandidates = [
        pdfRoot?.url,
        pdfRoot?.href,
        pdfRoot?.download,
        pdfRoot?.downloadUrl,
        pdfRoot?.link,
      ];
      for (const c of moreCandidates) {
        if (typeof c === "string" && c.trim() !== "") {
          pdfUrl = c;
          break;
        }
      }
    }

    if (!pdfUrl) {
      showError("No PDF link available for this invoice");
      return;
    }

    // --- START NEW LOGIC FOR SECURE PDF PROXY ---
    const isEconomicUrl = pdfUrl.startsWith("https://restapi.e-conomic.com");
    
    if (isEconomicUrl) {
      // If it's a secure e-conomic URL, we must proxy it via a direct browser call to the Edge Function
      let economicPath: string;
      try {
        const urlObj = new URL(pdfUrl);
        economicPath = urlObj.pathname + urlObj.search;
      } catch (e) {
        console.error("Failed to parse economic PDF URL:", e);
        showError("Invalid PDF URL format received from e-conomic.");
        return;
      }
      
      // Hardcoded Supabase Project ID and Function Name
      const proxyUrl = `https://vcpvwcfuvpngmxenhixj.supabase.co/functions/v1/economic-pdf-proxy?path=${encodeURIComponent(economicPath)}`;
      
      try {
        window.open(proxyUrl, "_blank");
        showSuccess("Opening invoice PDF securely.");
      } catch (e) {
        console.error("Error opening PDF proxy URL:", e);
        showError("Unable to open invoice PDF via secure proxy.");
      }
    } else {
      // If it's a public URL (e.g., from Supabase storage or another public CDN), open directly
      try {
        window.open(pdfUrl, "_blank");
        showSuccess("Opening invoice PDF");
      } catch (e) {
        console.error("Error opening PDF URL:", e);
        showError("Unable to open invoice PDF");
      }
    }
    // --- END NEW LOGIC FOR SECURE PDF PROXY ---
  }, [handleUnauthorized]);

  const loadInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    const toastId = showLoading("Loading invoices...");

    let list: any[] = [];
    const paths = num
      ? [
          `/customers/${num}/invoices?pagesize=100`,
          `/customers/${num}/invoices/booked?pagesize=100`,
          `/invoices?pagesize=100`,
          `/invoices/booked?pagesize=100`,
        ]
      : [
          `/invoices?pagesize=100`,
          `/invoices/booked?pagesize=100`,
        ];

    for (const path of paths) {
      const { data, error } = await supabase.functions.invoke("economic-proxy", {
        body: { path, method: "GET" },
      });
      if (!error && data) {
        const arr = extractList(data);
        if (arr.length > 0) {
          list = arr;
          break;
        }
      }
    }

    if (num != null && list.length > 0) {
      list = list.filter((inv: any) => {
        const cn = pick(inv, [
          "customerNumber",
          "customer.customerNumber",
          "customer.number",
          "customer_id",
        ]);
        return String(cn ?? "") === String(num);
      });
    }

    dismissToast(toastId);
    setLoadingInvoices(false);

    setInvoiceData(list);
    setShowInvoicesDialog(true);
    if (list.length > 0) {
      enrichInvoiceHeadings(list);
    }

    if (list.length > 0) {
      showSuccess(`Loaded ${list.length} invoices`);
    } else {
      showError("No invoices found for this customer");
    }
  }, [num, enrichInvoiceHeadings]);

  const loadLedgerCard = useCallback(async () => {
    console.log(`[CustomerRow] loadLedgerCard (v7): customerNumber=${num}, customerName=${customer.name}`);
    if (!num) {
      showError("Customer number is missing.");
      return;
    }
    setLoadingLedgerCard(true);
    const toastId = showLoading(`Loading ledger card for ${customer.name || 'customer'}...`);

    try {
      // CORRECTED PATH: Use the /customer-ledger-entries endpoint with customerNumber as a query parameter
      const pathForProxy = `/customer-ledger-entries?customerNumber=${num}&pagesize=1000`;
      const invocationUrl = `https://vcpvwcfuvpngmxenhixj.supabase.co/functions/v1/economic-proxy`; // Explicitly log the full invocation URL
      console.log(`[CustomerRow] loadLedgerCard (v7): Path to send to proxy: ${pathForProxy}`);
      console.log(`[CustomerRow] loadLedgerCard (v7): Full Edge Function invocation URL: ${invocationUrl}`); // NEW LOG
      const requestBodyForProxy = { path: pathForProxy, method: "GET" };
      console.log(`[CustomerRow] loadLedgerCard (v7): Request body for proxy: ${JSON.stringify(requestBodyForProxy)}`);

      const { data, error } = await supabase.functions.invoke("economic-proxy", {
        body: requestBodyForProxy,
      });

      console.log(`[CustomerRow] loadLedgerCard (v7): Raw response data from proxy:`, data); // NEW LOG

      if (error) {
        console.error(`[CustomerRow] Failed to fetch ledger entries for customer ${num}:`, error);
        throw new Error(error.message || "Failed to load customer ledger card.");
      }

      const resp = data as EconomicProxyResponse<EconomicCollection<any>>;
      if (resp?.status && resp.status >= 400) {
        console.error(`[CustomerRow] e-conomic API returned error status ${resp.status} for ${pathForProxy}:`, resp.data);
        // Safely access message/developerHint from resp.data if it's an object, or from resp.error
        const errorMessage = resp.error || (resp.data as any)?.message || (resp.data as any)?.developerHint || 'Unknown error from e-conomic API';
        throw new Error(`e-conomic API Error: ${errorMessage}`);
      }

      const list = extractList(resp?.data); // This should now directly return the filtered list for the customer
      console.log(`[CustomerRow] loadLedgerCard (v7): Fetched ${list.length} ledger entries for customer ${num}.`);
      
      setLedgerCardData(list); // No need for client-side filtering anymore if the API endpoint is correct
      setShowLedgerCardDialog(true);
      showSuccess(`Loaded ${list.length} ledger entries.`);
    } catch (err: any) {
      console.error("Error loading ledger card:", err);
      showError("Failed to load ledger card: " + err.message);
    } finally {
      dismissToast(toastId);
      setLoadingLedgerCard(false);
    }
  }, [num, customer.name]); // Dependencies for useCallback

  const invoiceColumns: DialogColumn[] = useMemo(() => [
    { key: 'invoiceNumber', header: 'Invoice No.', path: ['invoiceNumber', 'bookedInvoiceNumber', 'draftInvoiceNumber', 'id', 'number', 'invoiceId'] },
    { key: 'text', header: 'Text', path: ['description', 'text', 'notes.text', 'notes.heading', 'notes.header', 'notes.noteHeading', 'heading', 'title', 'header', 'recipient.name', 'customer.name'],
      render: (item) => {
        const key = getInvoiceKey(item);
        return invoiceHeadings[key] || getInvoiceDescription(item);
      }
    },
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'bookedDate', 'issueDate', 'invoiceDate', 'createdAt'] },
    { key: 'amount', header: 'Amount', format: 'currencyAmount', path: ['amount', 'totalAmount', 'amount.value', 'grossAmount', 'amountIncludingVat', 'total', 'netAmount'] },
    { key: 'currency', header: 'Currency', path: ['currency', 'currency.code'] },
    { key: 'status', header: 'Status', path: ['status.state', 'status.value', 'status', 'state', 'booked', 'paymentStatus', 'invoiceStatus', 'draft', 'sent'] },
    { key: 'pdf', header: 'PDF',
      render: (item) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => viewInvoice(item)}
          className="flex items-center gap-1"
        >
          <FileText className="h-4 w-4" /> View Invoice
        </Button>
      ),
    },
  ], [invoiceHeadings, viewInvoice, getInvoiceDescription]);

  const ledgerCardColumns: DialogColumn[] = [
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'entryDate', 'transactionDate', 'createdAt'] },
    { key: 'entryNumber', header: 'Entry No.', path: ['entryNumber', 'number', 'id'] },
    { key: 'invoiceNumber', header: 'Invoice No.', path: ['invoice.invoiceNumber', 'invoice.bookedInvoiceNumber', 'invoice.draftInvoiceNumber', 'invoice.id', 'invoice.number'] },
    { key: 'text', header: 'Text', path: ['text', 'description', 'notes.text', 'notes.heading'] },
    { key: 'amount', header: 'Amount', format: 'currencyAmount', path: ['amount', 'amount.value', 'totalAmount', 'grossAmount'] },
    { key: 'currency', header: 'Currency', path: ['currency', 'currency.code'] },
    { key: 'balance', header: 'Balance', format: 'currencyAmount', path: ['balance', 'balance.value'] },
    { key: 'dueDate', header: 'Due Date', format: 'date', path: ['dueDate', 'paymentTerms.dueDate'] },
  ];

  const isCustomerNumberMissing = !customer.customerNumber;

  const getButtonState = (buttonType: 'ledgerCard') => {
    const isLoadingState = loadingLedgerCard;
    let text = isLoadingState ? "Loading..." : "Ledger Card";
    let tooltip = "";
    let isDisabled = isLoadingState;

    if (isCustomerNumberMissing) {
      text = "No Customer Number";
      tooltip = "This customer has no associated customer number in e-conomic.";
      isDisabled = true;
    }

    return { text, tooltip, isDisabled };
  };

  const ledgerCardButtonState = getButtonState('ledgerCard');

  return (
    <>
      <TableRow>
        <TableCell>{customer.customerNumber ?? "-"}</TableCell>
        <TableCell className="font-medium">{customer.name ?? "-"}</TableCell>
        <TableCell>{customer.email ?? "-"}</TableCell>
        <TableCell>{customer.currency ?? "-"}</TableCell>
        <TableCell>
          {loadingBalance ? (
            "Loading..."
          ) : balanceError ? (
            <span className="text-red-500">Error</span>
          ) : balance !== null ? (
            <Badge className={cn("bg-dyad-blue text-white text-base px-3 py-2", "transform translate-x-0 translate-y-0")}>
              {formatAmount(balance)} {customer.currency || ''}
            </Badge>
          ) : (
            "N/A"
          )}
        </TableCell>
        <TableCell>
          {loadingBalance ? (
            "Loading..."
          ) : balanceError ? (
            <span className="text-red-500">Error</span>
          ) : (dueAmount !== null && dueAmount > 0) ? (
            <Badge className={cn("bg-red-600 text-white text-base px-3 py-2", "transform translate-x-0 translate-y-0")}>
              {formatAmount(dueAmount)} {customer.currency || ''}
            </Badge>
          ) : (
            "-"
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-2 items-center">
            <Button size="sm" className="flex-1 bg-dyad-blue hover:bg-dyad-blue-light text-white" onClick={loadInvoices} disabled={loadingInvoices}>
              {loadingInvoices ? "Loading..." : "View Invoices"}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" className="flex-1 bg-dyad-blue hover:bg-dyad-blue-light text-white" onClick={loadLedgerCard} disabled={ledgerCardButtonState.isDisabled}>
                  <BookText className="h-4 w-4 mr-1" /> {ledgerCardButtonState.text}
                </Button>
              </TooltipTrigger>
              {ledgerCardButtonState.tooltip && <TooltipContent>{ledgerCardButtonState.tooltip}</TooltipContent>}
            </Tooltip>
          </div>
        </TableCell>
      </TableRow>

      <EconomicDetailDialog
        isOpen={showInvoicesDialog}
        onOpenChange={setShowInvoicesDialog}
        title={`Invoices for ${customer.name || 'Customer'}`}
        description={`Showing all invoices for customer number ${customer.customerNumber}.`}
        data={invoiceData}
        columns={invoiceColumns}
        isLoading={loadingInvoices}
      />

      <EconomicDetailDialog
        isOpen={showLedgerCardDialog}
        onOpenChange={setShowLedgerCardDialog}
        title={`Ledger Card for ${customer.name || 'Customer'}`}
        description={`Showing all ledger entries for customer number ${customer.customerNumber}.`}
        data={ledgerCardData}
        columns={ledgerCardColumns}
        isLoading={loadingLedgerCard}
      />
    </>
  );
};

export default Customers;