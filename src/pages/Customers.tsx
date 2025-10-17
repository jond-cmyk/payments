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
import { List, FileText } from "lucide-react";
import EconomicDetailDialog, { DialogColumn } from "@/components/economic/EconomicDetailDialog";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatAmount } from "@/components/economic/EconomicDetailDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"; // Import Tooltip components

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
    country?: string;
  };
  currency?: string;
  self?: string;
  [key: string]: any;
};

type EconomicAccountingYear = {
  year: number;
  from: string;
  to: string;
  self: string;
};

const Customers: React.FC = () => {
  const { session, isLoading } = useSession();
  const navigate = useNavigate();

  const [pageSize, setPageSize] = useState<string>("25");
  const [search, setSearch] = useState<string>("");

  // State for Accounting Year selection in dialogs
  const [selectedAccountingYear, setSelectedAccountingYear] = useState<string | null>(null);
  const [availableAccountingYears, setAvailableAccountingYears] = useState<{ year: string; href: string }[]>([]);

  // Query to fetch available accounting years
  const accountingYearsQuery = useQuery({
    queryKey: ["economicAccountingYears"],
    queryFn: async () => {
      const { data: proxyResponse, error: invokeError } = await supabase.functions.invoke("economic-proxy", {
        body: { path: `/accounting-years?pagesize=100`, method: "GET" },
      });
      if (invokeError) {
        console.error("Error invoking economic-proxy for accounting years:", invokeError);
        throw new Error(invokeError.message || "Failed to load accounting years (proxy invocation error)");
      }
      console.log("Raw proxy response for accounting years:", proxyResponse);

      const resp = proxyResponse as EconomicProxyResponse<EconomicCollection<EconomicAccountingYear>>;

      // Check for e-conomic API errors (e.g., 401, 404)
      if (resp.status && resp.status >= 400) {
        const errorMessage = resp.error || `e-conomic API returned status ${resp.status}`;
        console.error("e-conomic API error for accounting years:", errorMessage, resp);
        // Provide specific advice for 401/403
        if (resp.status === 401 || resp.status === 403) {
          throw new Error("Unauthorized to access e-conomic accounting years. Check ECONOMIC_APP_SECRET_TOKEN and ECONOMIC_AGREEMENT_GRANT_TOKEN in Supabase Secrets.");
        }
        throw new Error(errorMessage);
      }

      let list: EconomicAccountingYear[] = [];
      if (Array.isArray(resp?.data?.collection)) {
        list = resp.data.collection;
      } else if (Array.isArray(resp?.data)) {
        list = resp.data as EconomicAccountingYear[];
      } else {
        console.warn("Unexpected structure for accounting years data:", resp);
      }
      
      // Sort by year descending and map to { year: string, href: string }
      const sortedYears = list
        .sort((a, b) => b.year - a.year)
        .map(y => ({ year: String(y.year), href: y.self }));
      
      console.log("Processed accounting years list:", sortedYears);
      return sortedYears;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Effect to set available accounting years and default selected year
  useEffect(() => {
    if (accountingYearsQuery.data && accountingYearsQuery.data.length > 0) {
      setAvailableAccountingYears(accountingYearsQuery.data);
      // Set default to the most recent year
      setSelectedAccountingYear(accountingYearsQuery.data[0].year);
    } else if (accountingYearsQuery.data && accountingYearsQuery.data.length === 0) {
      // If no accounting years are found, ensure selectedAccountingYear is null
      setSelectedAccountingYear(null);
    }
  }, [accountingYearsQuery.data]);

  const customersQuery = useQuery({
    queryKey: ["economicCustomers", pageSize],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("economic-proxy", {
        body: { path: `/customers?pagesize=${pageSize}`, method: "GET" },
      });
      if (error) throw new Error(error.message || "Failed to load customers");
      const resp = data as EconomicProxyResponse<EconomicCollection<EconomicCustomer>>;
      const list = Array.isArray(resp?.data?.collection) ? resp.data.collection : Array.isArray(resp?.data) ? (resp.data as any[]) : [];
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
        c.address?.city || "",
      ].map((s) => s.toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [customersQuery.data, search]);

  // Debugging logs for Customers page state
  console.log("Customers Page State:", {
    isLoading: isLoading,
    customersQueryLoading: customersQuery.isLoading,
    accountingYearsQueryLoading: accountingYearsQuery.isLoading,
    selectedAccountingYear: selectedAccountingYear,
    availableAccountingYearsLength: availableAccountingYears.length,
    customersDataLength: customersQuery.data?.length,
    filteredLength: filtered.length,
  });

  if (isLoading || customersQuery.isLoading || accountingYearsQuery.isLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading customers and accounting years...</div>;
  }
  if (!session) {
    navigate("/login");
    return null;
  }

  if (customersQuery.error) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading customers: {customersQuery.error.message}</div>;
  }

  if (accountingYearsQuery.error) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading accounting years: {accountingYearsQuery.error.message}</div>;
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

          {availableAccountingYears.length === 0 && (
            <Alert className="mb-4">
              <AlertTitle>No Accounting Years Found</AlertTitle>
              <AlertDescription>
                No accounting years were found in e-conomic. You might need to configure them in your e-conomic account to view transactions and outstanding items.
              </AlertDescription>
            </Alert>
          )}

          <div className="relative overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead className="w-64">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <CustomerRow 
                    key={c.customerNumber ?? c.name} 
                    customer={c} 
                    availableAccountingYears={availableAccountingYears}
                    selectedAccountingYear={selectedAccountingYear}
                    onAccountingYearChange={setSelectedAccountingYear}
                    isAccountingYearsLoading={accountingYearsQuery.isLoading}
                  />
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
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
  availableAccountingYears: { year: string; href: string }[];
  selectedAccountingYear: string | null;
  onAccountingYearChange: (year: string) => void;
  isAccountingYearsLoading: boolean;
}

const CustomerRow: React.FC<CustomerRowProps> = ({ customer, availableAccountingYears, selectedAccountingYear, onAccountingYearChange, isAccountingYearsLoading }) => {
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any[] | null>(null);

  // States for All Transactions and All Outstanding
  const [transactionsData, setTransactionsData] = useState<any[] | null>(null);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [outstandingData, setOutstandingData] = useState<any[] | null>(null);
  const [loadingOutstanding, setLoadingOutstanding] = useState(false);

  // Dialog visibility states
  const [showInvoicesDialog, setShowInvoicesDialog] = useState(false);
  const [showTransactionsDialog, setShowTransactionsDialog] = useState(false);
  const [showOutstandingDialog, setShowOutstandingDialog] = useState(false);

  // Keep a map of headings for invoices (keyed by self URL or number)
  const [invoiceHeadings, setInvoiceHeadings] = useState<Record<string, string>>({});

  const num = customer.customerNumber;

  // Debugging logs for CustomerRow
  console.log("CustomerRow Props for customer:", customer.customerNumber, {
    customerNumber: customer.customerNumber,
    selectedAccountingYear: selectedAccountingYear,
    isAccountingYearsLoading: isAccountingYearsLoading,
    loadingInvoices: loadingInvoices,
    loadingTransactions: loadingTransactions,
    loadingOutstanding: loadingOutstanding,
  });

  // Helper to extract a list from varied economic response shapes
  const extractList = (payload: any): any[] => {
    const economicResponseData = payload?.data;
    if (!economicResponseData) {
      return [];
    }

    const candidates = [
      economicResponseData.collection,
      economicResponseData.items,
      economicResponseData.results,
      economicResponseData.entries,
      economicResponseData.invoices
    ];

    for (const c of candidates) {
      if (Array.isArray(c)) {
        return c;
      }
    }
    
    if (Array.isArray(economicResponseData)) {
      return economicResponseData;
    }

    if (typeof economicResponseData === "object") {
      for (const k of Object.keys(economicResponseData)) {
        const v = (economicResponseData as any)[k];
        if (Array.isArray(v)) {
          return v;
        }
      }
    }
    
    return [];
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
          found = false;
          break;
        }
      }
      if (found) return current;
    }
    return undefined;
  };

  // Fetch balance automatically using useQuery
  const { data: balance, isLoading: loadingBalance, error: balanceError } = useQuery<number | null>({
    queryKey: ["customerBalance", num],
    queryFn: async () => {
      if (!num) return null;
      const { data, error } = await supabase.functions.invoke("economic-proxy", {
        body: { path: `/customers/${num}/totals`, method: "GET" },
      });

      if (error) {
        console.error("Failed to load balance:", error);
        throw new Error(error.message || "Failed to load balance");
      }

      const resp = data as EconomicProxyResponse<any>;

      const getNumeric = (obj: any, keys: string[]): number | null => {
        for (const k of keys) {
          const v = k.split(".").reduce((acc: any, part: string) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
          if (typeof v === "number") return v;
          if (typeof v === "string" && !isNaN(Number(v))) return Number(v);
        }
        return null;
      };

      let val = getNumeric(resp?.data, ["balance", "totals.balance", "outstandingAmount", "openEntriesAmount", "dueAmount"]) ?? null;

      if (val === null) {
        const { data: detailsData, error: detailsError } = await supabase.functions.invoke("economic-proxy", {
          body: { path: `/customers/${num}`, method: "GET" },
        });
        if (!detailsError) {
          const detailsResp = detailsData as EconomicProxyResponse<any>;
          val = getNumeric(detailsResp?.data, ["balance", "totals.balance", "outstandingAmount", "openEntriesAmount", "dueAmount"]) ?? null;
        }
      }
      return val;
    },
    enabled: !!num,
    staleTime: 5 * 60 * 1000,
  });

  // Build a path from a 'self' URL to pass through the economic-proxy
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

  // Stable key for invoice map
  const getInvoiceKey = (inv: any): string => {
    if (inv?.self) return String(inv.self);
    if (inv?.bookedInvoiceNumber) return `booked:${inv.bookedInvoiceNumber}`;
    if (inv?.invoiceNumber) return `invoice:${inv.invoiceNumber}`;
    if (inv?.id) return `id:${inv.id}`;
    return JSON.stringify(inv);
  };

  // Extract the description field from invoice
  const getInvoiceDescription = useCallback((inv: any): string => {
    const candidates = [
      inv?.description,
      inv?.text,
      inv?.notes?.text,
      inv?.notes?.heading,
      inv?.notes?.header,
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

  // Try to fetch the detailed invoice and extract the "Notes and references -> Heading"
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

    // Prioritize specific heading/description fields from the detailed response
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
    
    // Final fallback: use the generic description getter
    if (!found) {
      found = getInvoiceDescription(root);
    }

    if (!found || found === "-") return;

    const key = getInvoiceKey(inv);
    setInvoiceHeadings((prev) => ({ ...prev, [key]: found as string }));
  }, [getInvoiceDescription, setInvoiceHeadings]);

  // Enrich headings for a list of invoices without blocking UI
  const enrichInvoiceHeadings = useCallback(async (list: any[]) => {
    for (const inv of list) {
      const key = getInvoiceKey(inv);
      if (!invoiceHeadings[key]) {
        const basic = getInvoiceDescription(inv);
        if (basic && basic !== "-") {
          setInvoiceHeadings((prev) => ({ ...prev, [key]: basic }));
        } else {
          // fire-and-forget detail fetch
          fetchHeadingForInvoice(inv);
        }
      }
    }
  }, [invoiceHeadings, getInvoiceDescription, fetchHeadingForInvoice]);

  // New helper function to handle 401 responses and attempt demo fallbacks
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

    // If no direct demoLink or opening failed, try fetching with ?demo=true
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

  // View invoice: fetch details and open PDF link if available
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

    // --- First attempt: Fetch invoice details ---
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

    // --- Fallback: try /pdf subresource via proxy if no PDF URL found yet ---
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

    try {
      window.open(pdfUrl, "_blank");
      showSuccess("Opening invoice PDF");
    } catch (e) {
      console.error("Error opening PDF URL:", e);
      showError("Unable to open invoice PDF");
    }
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

  // Load all transactions for a customer
  const loadTransactions = async () => {
    if (!num || !selectedAccountingYear) {
      showError("Please select an accounting year.");
      return;
    }
    setLoadingTransactions(true);
    const toastId = showLoading(`Loading all transactions for ${selectedAccountingYear}...`);

    const path = `/accounting-years/${selectedAccountingYear}/entries`;

    const { data, error } = await supabase.functions.invoke("economic-proxy", {
      body: { path, query: { pagesize: 1000, debtorNumber: num }, method: "GET" },
    });
    dismissToast(toastId);

    if (error) {
      setLoadingTransactions(false);
      showError(error.message || "Failed to load transactions");
      return;
    }

    const allEntries = extractList(data);

    const customerTransactions = allEntries.filter(entry => {
      const entryCustomerNumber = pick(entry, [
        'customerNumber',
        'customer.customerNumber',
        'debtor.customerNumber',
        'debtor.number',
        'creditor.customerNumber',
        'creditor.number',
        'customer.number',
        'customer.id',
        'debtor.id',
        'creditor.id',
      ]);
      return String(entryCustomerNumber ?? "") === String(num);
    });

    setTransactionsData(customerTransactions);
    setShowTransactionsDialog(true);
    setLoadingTransactions(false);

    if (customerTransactions.length > 0) {
      showSuccess(`Loaded ${customerTransactions.length} transactions`);
    } else {
      showError("No transactions found for this customer in the selected accounting year.");
    }
  };

  // Load all outstanding transactions for a customer
  const loadOutstanding = async () => {
    if (!num || !selectedAccountingYear) {
      showError("Please select an accounting year.");
      return;
    }
    setLoadingOutstanding(true);
    const toastId = showLoading(`Loading outstanding transactions for ${selectedAccountingYear}...`);

    const path = `/accounting-years/${selectedAccountingYear}/entries`;

    const { data, error } = await supabase.functions.invoke("economic-proxy", {
      body: { path, query: { pagesize: 1000, debtorNumber: num }, method: "GET" },
    });
    dismissToast(toastId);

    if (error) {
      setLoadingOutstanding(false);
      showError(error.message || "Failed to load outstanding transactions");
      return;
    }

    const allEntries = extractList(data);

    const outstandingEntries = allEntries.filter(entry => {
      const entryCustomerNumber = pick(entry, [
        'customerNumber',
        'customer.customerNumber',
        'debtor.customerNumber',
        'debtor.number',
        'creditor.customerNumber',
        'creditor.number',
        'customer.number',
        'customer.id',
        'debtor.id',
        'creditor.id',
      ]);
      const remainingAmount = pick(entry, [
        'remainingAmount',
        'remainingAmount.value',
        'amount.remaining',
        'balance',
        'outstandingAmount',
        'openEntriesAmount',
        'dueAmount',
      ]);
      return String(entryCustomerNumber ?? "") === String(num) && typeof remainingAmount === 'number' && remainingAmount > 0;
    });

    setOutstandingData(outstandingEntries);
    setShowOutstandingDialog(true);
    setLoadingOutstanding(false);

    if (outstandingEntries.length > 0) {
      showSuccess(`Loaded ${outstandingEntries.length} outstanding transactions`);
    } else {
      showError("No outstanding transactions found for this customer in the selected accounting year.");
    }
  };

  // Column definitions for the dialogs
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

  const transactionColumns: DialogColumn[] = [
    { key: 'entryNumber', header: 'Entry No.', path: ['entryNumber', 'number', 'id'] },
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'entryDate', 'transactionDate', 'createdAt'] },
    { key: 'description', header: 'Description', path: ['description', 'text', 'notes.heading', 'notes.text'] },
    { key: 'amount', header: 'Amount', format: 'currencyAmount', path: ['amount', 'totalAmount', 'amount.value', 'grossAmount', 'amountIncludingVat', 'total', 'netAmount'] },
    { key: 'currency', header: 'Currency', path: ['currency', 'currency.code'] },
    { key: 'type', header: 'Type', path: ['type', 'entryType', 'transactionType'] },
    { key: 'remainingAmount', header: 'Outstanding', format: 'currencyAmount', path: ['remainingAmount', 'remainingAmount.value', 'amount.remaining'] },
  ];

  const outstandingColumns: DialogColumn[] = [
    { key: 'entryNumber', header: 'Entry No.', path: ['entryNumber', 'number', 'id'] },
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'entryDate', 'transactionDate', 'createdAt'] },
    { key: 'description', header: 'Description', path: ['description', 'text', 'notes.heading', 'notes.text'] },
    { key: 'amount', header: 'Total Amount', format: 'currencyAmount', path: ['amount', 'totalAmount', 'amount.value', 'grossAmount', 'amountIncludingVat', 'total', 'netAmount'] },
    { key: 'currency', header: 'Currency', path: ['currency', 'currency.code'] },
    { key: 'remainingAmount', header: 'Outstanding Amount', format: 'currencyAmount', path: ['remainingAmount', 'remainingAmount.value', 'amount.remaining'] },
    { key: 'dueDate', header: 'Due Date', format: 'date', path: ['dueDate', 'paymentTerms.dueDate'] },
  ];

  // Determine disabled states and tooltips for buttons
  const isCustomerNumberMissing = !customer.customerNumber;
  const isAccountingYearNotReady = isAccountingYearsLoading || !selectedAccountingYear;

  const getButtonState = (buttonType: 'transactions' | 'outstanding') => {
    const isLoadingState = buttonType === 'transactions' ? loadingTransactions : loadingOutstanding;
    let text = isLoadingState ? "Loading..." : (buttonType === 'transactions' ? "All Transactions" : "All Outstanding");
    let tooltip = "";
    let isDisabled = isLoadingState;

    if (isCustomerNumberMissing) {
      text = "No Customer Number";
      tooltip = "This customer has no associated customer number in e-conomic.";
      isDisabled = true;
    } else if (isAccountingYearNotReady) {
      text = isAccountingYearsLoading ? "Loading Years..." : "No Year Selected";
      tooltip = isAccountingYearsLoading ? "Accounting years are still loading." : "No accounting year is selected. Please select one from the dropdown above the table.";
      isDisabled = true;
    }

    return { text, tooltip, isDisabled };
  };

  const transactionsButtonState = getButtonState('transactions');
  const outstandingButtonState = getButtonState('outstanding');

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
          <div className="flex flex-wrap gap-2 items-center">
            <Button size="sm" className="flex-1 bg-dyad-blue hover:bg-dyad-blue-light text-white" onClick={loadInvoices} disabled={loadingInvoices}>
              {loadingInvoices ? "Loading..." : "View Invoices"}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" className="flex-1 bg-dyad-blue hover:bg-dyad-blue-light text-white" onClick={loadTransactions} disabled={transactionsButtonState.isDisabled}>
                  {transactionsButtonState.text}
                </Button>
              </TooltipTrigger>
              {transactionsButtonState.tooltip && <TooltipContent>{transactionsButtonState.tooltip}</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" className="flex-1 bg-dyad-blue hover:bg-dyad-blue-light text-white" onClick={loadOutstanding} disabled={outstandingButtonState.isDisabled}>
                  {outstandingButtonState.text}
                </Button>
              </TooltipTrigger>
              {outstandingButtonState.tooltip && <TooltipContent>{outstandingButtonState.tooltip}</TooltipContent>}
            </Tooltip>
          </div>
        </TableCell>
      </TableRow>

      {/* Dialog for Invoices */}
      <EconomicDetailDialog
        isOpen={showInvoicesDialog}
        onOpenChange={setShowInvoicesDialog}
        title={`Invoices for ${customer.name || 'Customer'}`}
        description={`Showing all invoices for customer number ${customer.customerNumber}.`}
        data={invoiceData}
        columns={invoiceColumns}
        isLoading={loadingInvoices}
      />

      {/* Dialog for All Transactions */}
      <EconomicDetailDialog
        isOpen={showTransactionsDialog}
        onOpenChange={setShowTransactionsDialog}
        title={`All Transactions for ${customer.name || 'Customer'}`}
        description={`Showing all accounting entries for customer number ${customer.customerNumber}.`}
        data={transactionsData}
        columns={transactionColumns}
        isLoading={loadingTransactions}
        accountingYears={availableAccountingYears}
        selectedAccountingYear={selectedAccountingYear}
        onAccountingYearChange={(year) => {
          onAccountingYearChange(year);
          loadTransactions();
        }}
        isAccountingYearsLoading={isAccountingYearsLoading}
      />

      {/* Dialog for All Outstanding */}
      <EconomicDetailDialog
        isOpen={showOutstandingDialog}
        onOpenChange={setShowOutstandingDialog}
        title={`Outstanding Transactions for ${customer.name || 'Customer'}`}
        description={`Showing outstanding accounting entries for customer number ${customer.customerNumber}.`}
        data={outstandingData}
        columns={outstandingColumns}
        isLoading={loadingOutstanding}
        accountingYears={availableAccountingYears}
        selectedAccountingYear={selectedAccountingYear}
        onAccountingYearChange={(year) => {
          onAccountingYearChange(year);
          loadOutstanding();
        }}
        isAccountingYearsLoading={isAccountingYearsLoading}
      />
    </>
  );
};

export default Customers;