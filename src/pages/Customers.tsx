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

// Utility function to extract a list from varied economic response shapes
const extractList = (payload: any): any[] => {
  if (!payload) {
    return [];
  }

  const economicResponseData = payload?.data;
  if (!economicResponseData) {
    return [];
  }

  const candidates = [
    economicResponseData.collection,
    economicResponseData.items,
    economicResponseData.results,
    economicResponseData.entries,
    economicResponseData.invoices,
    economicResponseData.accountingYears?.collection, // NEW: Check for nested collection
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
        current = undefined;
        found = false;
        break;
      }
    }
    if (found) {
      // If the found value is an object with a 'value' property, use that
      if (typeof current === 'object' && current !== null && 'value' in current && typeof current.value === 'number') {
        return current.value;
      }
      // Attempt to parse to number if it looks like one
      if (typeof current === 'string' && !isNaN(parseFloat(current))) {
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
      const { data, error } = await supabase.functions.invoke("economic-proxy", {
        body: { path: `/customers?pagesize=${pageSize}`, method: "GET" },
      });
      if (error) throw new Error(error.message || "Failed to load customers");
      const resp = data as EconomicProxyResponse<EconomicCollection<EconomicCustomer>>;
      const list = extractList(resp?.data);
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
    customersDataLength: customersQuery.data?.length,
    filteredLength: filtered.length,
  });

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
                <TableRow>
                  <TableHead className="w-24">Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Overdue</TableHead> {/* NEW: Overdue column header */}
                  <TableHead className="w-64">Actions</TableHead>
                </TableRow>
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
                    <TableCell colSpan={7} className="text-center text-muted-foreground"> {/* Updated colSpan */}
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

  // NEW: State for accounting years
  const [accountingYears, setAccountingYears] = useState<{ year: string; href: string }[]>([]);
  const [selectedAccountingYear, setSelectedAccountingYear] = useState<string | null>(null);
  const [isAccountingYearsLoading, setIsAccountingYearsLoading] = useState(false);

  const num = customer.customerNumber;

  // Debugging logs for CustomerRow
  console.log("CustomerRow Props for customer:", customer.customerNumber, {
    customerNumber: customer.customerNumber,
    loadingInvoices: loadingInvoices,
    loadingTransactions: loadingTransactions,
    loadingOutstanding: loadingOutstanding,
  });

  // NEW: Fetch available accounting years
  useEffect(() => {
    const fetchAccountingYears = async () => {
      if (!num) return;
      setIsAccountingYearsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("economic-proxy", {
          body: { path: `/accounting-years?pagesize=100`, method: "GET" },
        });
        if (error) throw new Error(error.message || "Failed to load accounting years");
        const resp = data as EconomicProxyResponse<EconomicCollection<EconomicAccountingYear>>;
        const years = extractList(resp?.data).map(y => ({
          year: String(y.year),
          href: y.self,
        }));
        setAccountingYears(years);
        if (years.length > 0) {
          // Default to the latest year
          const latestYear = years.sort((a, b) => parseInt(b.year) - parseInt(a.year))[0].year;
          setSelectedAccountingYear(latestYear);
        }
      } catch (err: any) {
        console.error("Error fetching accounting years:", err);
        showError("Failed to load accounting years: " + err.message);
      } finally {
        setIsAccountingYearsLoading(false);
      }
    };
    fetchAccountingYears();
  }, [num]);


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
          const v = pick(obj, [k]); // Use the enhanced pick function
          if (typeof v === "number") return v;
        }
        return null;
      };

      let balanceVal = getNumeric(resp?.data, ["balance", "totals.balance", "outstandingAmount", "openEntriesAmount"]) ?? null;
      let dueAmountVal = getNumeric(resp?.data, ["dueAmount", "totals.dueAmount"]) ?? null;

      // Fallback to /customers/{num} if /totals doesn't provide enough info
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
  const loadTransactions = useCallback(async () => {
    if (!num || !selectedAccountingYear) {
      showError("Customer number or accounting year is missing.");
      return;
    }
    setLoadingTransactions(true);
    const toastId = showLoading(`Loading all transactions for ${selectedAccountingYear}...`);

    let allEntries: any[] = [];
    let debtorEntries: any[] = [];
    let creditorEntries: any[] = [];

    // Attempt to fetch as debtor
    console.log(`[loadTransactions] Attempting to fetch entries as debtor for customer ${num} in year ${selectedAccountingYear}...`);
    const { data: debtorData, error: debtorError } = await supabase.functions.invoke("economic-proxy", {
      body: { path: `/entries`, query: { pagesize: 1000, debtorNumber: num, accountingYear: selectedAccountingYear }, method: "GET" },
    });
    console.log(`[loadTransactions] Debtor entries raw response:`, debtorData); // ADDED LOG
    if (debtorError) {
      console.error(`[loadTransactions] Error fetching as debtor: ${debtorError.message}`);
    } else {
      debtorEntries = extractList(debtorData);
      console.log(`[loadTransactions] Fetched ${debtorEntries.length} entries as debtor.`);
    }

    // Attempt to fetch as creditor
    console.log(`[loadTransactions] Attempting to fetch entries as creditor for customer ${num} in year ${selectedAccountingYear}...`);
    const { data: creditorData, error: creditorError } = await supabase.functions.invoke("economic-proxy", {
      body: { path: `/entries`, query: { pagesize: 1000, creditorNumber: num, accountingYear: selectedAccountingYear }, method: "GET" },
    });
    console.log(`[loadTransactions] Creditor entries raw response:`, creditorData); // ADDED LOG
    if (creditorError) {
      console.error(`[loadTransactions] Error fetching as creditor: ${creditorError.message}`);
    } else {
      creditorEntries = extractList(creditorData);
      console.log(`[loadTransactions] Fetched ${creditorEntries.length} entries as creditor.`);
    }

    allEntries = [...debtorEntries, ...creditorEntries];
    console.log(`[loadTransactions] Combined allEntries count: ${allEntries.length}`);

    dismissToast(toastId);

    if (debtorError && creditorError) {
      setLoadingTransactions(false);
      showError(debtorError.message || creditorError.message || "Failed to load transactions");
      return;
    }

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
      
      console.log(`[loadTransactions] Processing entry: ${JSON.stringify(entry)}`);
      console.log(`[loadTransactions] Entry customer number: ${entryCustomerNumber}, Target customer number: ${num}`);

      return String(entryCustomerNumber ?? "") === String(num);
    });

    setTransactionsData(customerTransactions);
    setShowTransactionsDialog(true);
    setLoadingTransactions(false);

    if (customerTransactions.length > 0) {
      showSuccess(`Loaded ${customerTransactions.length} transactions`);
    } else {
      showError("No transactions found for this customer.");
    }
  }, [num, selectedAccountingYear]);

  // Load all outstanding transactions for a customer
  const loadOutstanding = useCallback(async () => {
    if (!num || !selectedAccountingYear) {
      showError("Customer number or accounting year is missing.");
      return;
    }
    setLoadingOutstanding(true);
    const toastId = showLoading(`Loading outstanding transactions for ${selectedAccountingYear}...`);

    let allEntries: any[] = [];
    let debtorEntries: any[] = [];
    let creditorEntries: any[] = [];

    // Attempt to fetch as debtor
    console.log(`[loadOutstanding] Attempting to fetch entries as debtor for customer ${num} in year ${selectedAccountingYear}...`);
    const { data: debtorData, error: debtorError } = await supabase.functions.invoke("economic-proxy", {
      body: { path: `/entries`, query: { pagesize: 1000, debtorNumber: num, accountingYear: selectedAccountingYear }, method: "GET" },
    });
    console.log(`[loadOutstanding] Debtor entries raw response:`, debtorData); // ADDED LOG
    if (debtorError) {
      console.error(`[loadOutstanding] Error fetching as debtor: ${debtorError.message}`);
    } else {
      debtorEntries = extractList(debtorData);
      console.log(`[loadOutstanding] Fetched ${debtorEntries.length} entries as debtor.`);
    }

    // Attempt to fetch as creditor
    console.log(`[loadOutstanding] Attempting to fetch entries as creditor for customer ${num} in year ${selectedAccountingYear}...`);
    const { data: creditorData, error: creditorError } = await supabase.functions.invoke("economic-proxy", {
      body: { path: `/entries`, query: { pagesize: 1000, creditorNumber: num, accountingYear: selectedAccountingYear }, method: "GET" },
    });
    console.log(`[loadOutstanding] Creditor entries raw response:`, creditorData); // ADDED LOG
    if (creditorError) {
      console.error(`[loadOutstanding] Error fetching as creditor: ${creditorError.message}`);
    } else {
      creditorEntries = extractList(creditorData);
      console.log(`[loadOutstanding] Fetched ${creditorEntries.length} entries as creditor.`);
    }

    allEntries = [...debtorEntries, ...creditorEntries];
    console.log(`[loadOutstanding] Combined allEntries count: ${allEntries.length}`);

    dismissToast(toastId);

    if (debtorError && creditorError) {
      setLoadingOutstanding(false);
      showError(debtorError.message || creditorError.message || "Failed to load outstanding transactions");
      return;
    }

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
      
      console.log(`[loadOutstanding] Processing entry: ${JSON.stringify(entry)}`);
      console.log(`[loadOutstanding] Entry customer number: ${entryCustomerNumber}, Target customer number: ${num}`);

      const remainingAmount = pick(entry, [
        'remainingAmount',
        'remainingAmount.value',
        'dueAmount',
        'dueAmount.value',
        'amount', // ADDED: Fallback to 'amount'
        'amount.value', // ADDED: Fallback to 'amount.value'
      ]);

      console.log(`[loadOutstanding] Extracted remainingAmount (after pick): ${remainingAmount}, Type: ${typeof remainingAmount}`);
      
      const isOutstanding = String(entryCustomerNumber ?? "") === String(num) && typeof remainingAmount === 'number' && remainingAmount > 0;
      console.log(`[loadOutstanding] Is outstanding: ${isOutstanding}`);
      
      return isOutstanding;
    });

    setOutstandingData(outstandingEntries);
    setShowOutstandingDialog(true);
    setLoadingOutstanding(false);

    if (outstandingEntries.length > 0) {
      showSuccess(`Loaded ${outstandingEntries.length} outstanding transactions`);
    } else {
      showError("No outstanding transactions found for this customer.");
    }
  }, [num, selectedAccountingYear]);

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
  const isAccountingYearMissing = !selectedAccountingYear;

  const getButtonState = (buttonType: 'transactions' | 'outstanding') => {
    const isLoadingState = buttonType === 'transactions' ? loadingTransactions : loadingOutstanding;
    let text = isLoadingState ? "Loading..." : (buttonType === 'transactions' ? "All Transactions" : "All Outstanding");
    let tooltip = "";
    let isDisabled = isLoadingState || isAccountingYearsLoading;

    if (isCustomerNumberMissing) {
      text = "No Customer Number";
      tooltip = "This customer has no associated customer number in e-conomic.";
      isDisabled = true;
    } else if (isAccountingYearMissing) {
      text = "Select Year";
      tooltip = "Please select an accounting year to view transactions.";
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
        <TableCell> {/* NEW: Overdue column cell */}
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
        accountingYears={accountingYears}
        selectedAccountingYear={selectedAccountingYear}
        onAccountingYearChange={setSelectedAccountingYear}
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
        accountingYears={accountingYears}
        selectedAccountingYear={selectedAccountingYear}
        onAccountingYearChange={setSelectedAccountingYear}
        isAccountingYearsLoading={isAccountingYearsLoading}
      />
    </>
  );
};

export default Customers;