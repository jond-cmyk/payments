"use client";

import React, { useMemo, useState } from "react";
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
import { List } from "lucide-react";
import EconomicDetailDialog from "@/components/economic/EconomicDetailDialog"; // Import EconomicDetailDialog

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

const Customers: React.FC = () => {
  const { session, isLoading } = useSession(); // Removed userProfile
  const navigate = useNavigate();
  // Removed isAdmin state

  const [pageSize, setPageSize] = useState<string>("25");
  const [search, setSearch] = useState<string>("");

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }
  if (!session) {
    navigate("/login");
    return null;
  }
  // Removed isAdmin check

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
        c.phone || "",
        c.address?.street || "",
        c.address?.city || "",
      ].map((s) => s.toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [customersQuery.data, search]);

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
                  <TableHead>Phone</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="w-64">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <CustomerRow key={c.customerNumber ?? c.name} customer={c} />
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {customersQuery.isLoading ? "Loading customers..." : "No customers found."}
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

// Define a type for columns that matches the dialog's props
type DialogColumn = { key: string; header: string; format?: 'date' | 'amount' | 'currencyAmount' | 'boolean' | 'array' | 'object' | 'raw'; path?: string[] };


const CustomerRow: React.FC<{ customer: EconomicCustomer }> = ({ customer }) => {
  const [expanded, setExpanded] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [invoiceData, setInvoiceData] = useState<any[] | null>(null); // Renamed from 'invoices'
  const [loadingInvoices, setLoadingInvoices] = useState(false);

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

  // Build a path from a 'self' URL to pass through the economic-proxy
  const pathFromSelf = (self: string): string | undefined => {
    if (typeof self !== "string" || !self) return undefined;
    if (self.startsWith("http")) {
      const parts = self.split("/");
      if (parts.length >= 4) {
        return "/" + parts.slice(3).join("/");
      }
      return undefined;
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

  // Try to fetch the detailed invoice and extract the "Notes and references -> Heading"
  const fetchHeadingForInvoice = async (inv: any) => {
    const path =
      pathFromSelf(inv?.self) ??
      (inv?.bookedInvoiceNumber ? `/invoices/booked/${inv.bookedInvoiceNumber}` : undefined);
    if (!path) return;

    const { data, error } = await supabase.functions.invoke("economic-proxy", {
      body: { path, method: "GET" },
    });
    if (error || !data) return;

    const root = (data as any)?.data ?? data;

    // Prefer the Notes and references -> Heading
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
    if (!found) return;

    const key = getInvoiceKey(inv);
    setInvoiceHeadings((prev) => ({ ...prev, [key]: found as string }));
  };

  // Enrich headings for a list of invoices without blocking UI
  const enrichInvoiceHeadings = async (list: any[]) => {
    for (const inv of list) {
      const key = getInvoiceKey(inv);
      if (!invoiceHeadings[key]) {
        const basic = getInvoiceText(inv);
        if (basic && basic !== "-") {
          setInvoiceHeadings((prev) => ({ ...prev, [key]: basic }));
        } else {
          // fire-and-forget detail fetch
          fetchHeadingForInvoice(inv);
        }
      }
    }
  };

  const num = customer.customerNumber;

  // Helper to extract a list from varied economic response shapes
  const extractList = (payload: any): any[] => {
    const root = (payload && payload.data) ? payload.data : payload;
    if (Array.isArray(root)) return root;
    const candidates = [
      root?.collection,
      root?.items,
      root?.results,
      root?.entries,
      root?.invoices
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) return c;
    }
    if (root && typeof root === "object") {
      for (const k of Object.keys(root)) {
        const v = (root as any)[k];
        if (Array.isArray(v)) return v;
      }
    }
    return [];
  };

  // Generic getter for nested value
  const pick = (obj: any, keys: string[]) => {
    for (const k of keys) {
      const v = k.split(".").reduce((acc: any, part: string) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
      if (v !== undefined && v !== null) {
        // If it's a URL-like string, extract the last segment
        if (typeof v === "string" && v.includes("/")) {
          const parts = v.split("/").filter(Boolean);
          const last = parts[parts.length - 1];
          return last ?? v;
        }
        return v;
      }
    }
    return undefined;
  };

  // Helper to format a date string to DD-MM-YYYY
  const formatDate = (dateInput: any): string => {
    if (!dateInput) return "-";
    let date: Date;
    if (typeof dateInput === "string") {
      date = new Date(dateInput);
    } else if (dateInput instanceof Date) {
      date = dateInput;
    } else {
      return "-";
    }
    if (isNaN(date.getTime())) return "-";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Helper to format amount with thousand separators and two decimal places
  const formatAmount = (amountInput: any): string => {
    if (amountInput === null || amountInput === undefined) return "-";
    const num = typeof amountInput === "number" ? amountInput : parseFloat(String(amountInput));
    if (isNaN(num)) return "-";
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Extract the heading field from invoice
  const getInvoiceText = (inv: any): string => {
    // Directly get the heading field
    const heading = inv.heading;
    if (typeof heading === "string" && heading.trim() !== "") return heading;
    const fallbackFields = ["title", "header", "description", "text"];
    for (const field of fallbackFields) {
      const value = inv[field];
      if (typeof value === "string" && value.trim() !== "") return value;
    }
    return "-";
  };

  // New helper function to handle 401 responses and attempt demo fallbacks
  const handleUnauthorized = async (economicErrorResponse: any, originalRequestPath: string): Promise<boolean> => {
    const demoLink = economicErrorResponse?.demoLink;
    if (typeof demoLink === "string" && demoLink.trim() !== "") {
      try {
        window.open(demoLink, "_blank");
        showSuccess("Opening demo invoice PDF");
        return true; // Demo link opened
      } catch (e) {
        console.error("Failed to open demoLink:", e);
        // Fall through to try ?demo=true
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
            return true; // Demo link opened
          } catch (e) {
            console.error("Failed to open ?demo=true PDF URL:", e);
          }
        }
      }
    }

    showError("Unauthorized to access invoice PDF. Check ECONOMIC_APP_SECRET_TOKEN and ECONOMIC_AGREEMENT_GRANT_TOKEN in Supabase Secrets.");
    return false; // No demo link opened
  };

  // View invoice: fetch details and open PDF link if available
  const viewInvoice = async (inv: any) => {
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
    const initialRoot = initialEconomicResponse?.data ?? initialProxyResponse; // This is the actual e-conomic response
    const economicHttpStatus = initialRoot?.httpStatusCode || initialRoot?.status; // This is the actual e-conomic status

    if (economicHttpStatus === 401) {
      const handled = await handleUnauthorized(initialRoot, basePath);
      if (handled) return; // If demo was opened, we're done
      // If not handled, error message already shown by handleUnauthorized
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

    // If pdf is an object, try any string value inside it
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
      const pdfRoot = pdfEconomicResponse?.data ?? pdfProxyResponse; // Actual e-conomic response for /pdf
      const pdfEconomicHttpStatus = pdfRoot?.httpStatusCode || pdfRoot?.status;

      if (pdfEconomicHttpStatus === 401) {
        const handled = await handleUnauthorized(pdfRoot, pdfPath);
        if (handled) return; // If demo was opened, we're done
        // If not handled, error message already shown by handleUnauthorized
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
  };

  const loadBalance = async () => {
    if (!num) return;
    setLoadingBalance(true);
    const toastId = showLoading("Loading balance...");
    console.log("Loading balance for customer:", num);
    const { data, error } = await supabase.functions.invoke("economic-proxy", {
      body: { path: `/customers/${num}/totals`, method: "GET" },
    });
    console.log("Balance (totals) response:", data);
    // Close loading toast
    dismissToast(toastId);

    if (error) {
      setLoadingBalance(false);
      showError(error.message || "Failed to load balance");
      return;
    }

    const resp = data as EconomicProxyResponse<any>;
    console.log("Parsed balance (totals) response:", resp);

    // Helper: get first numeric value from candidate fields
    const getNumeric = (obj: any, keys: string[]): number | null => {
      for (const k of keys) {
        const v = k.split(".").reduce((acc: any, part: string) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
        if (typeof v === "number") return v;
        if (typeof v === "string" && !isNaN(Number(v))) return Number(v);
      }
      return null;
    };

    let val =
      getNumeric(resp?.data, ["balance", "totals.balance", "outstandingAmount", "openEntriesAmount", "dueAmount"]) ?? null;

    if (val === null) {
      // Fallback: fetch customer details to find balance-like fields
      const { data: detailsData, error: detailsError } = await supabase.functions.invoke("economic-proxy", {
        body: { path: `/customers/${num}`, method: "GET" },
      });
      console.log("Customer details for balance fallback:", detailsData);
      if (!detailsError) {
        const detailsResp = detailsData as EconomicProxyResponse<any>;
        val =
          getNumeric(detailsResp?.data, [
            "balance",
            "totals.balance",
            "outstandingAmount",
            "openEntriesAmount",
            "dueAmount",
          ]) ?? null;
      }
    }

    setLoadingBalance(false);

    if (val === null) {
      showError("Balance not available for this customer");
    } else {
      setBalance(val);
      showSuccess("Balance loaded");
    }
  };

  const loadInvoices = async () => {
    setLoadingInvoices(true);
    const toastId = showLoading("Loading invoices...");
    console.log("Loading invoices for customer:", num);

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
      console.log(`Invoice response for ${path}:`, data);
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

    console.log("Filtered invoices list:", list);

    dismissToast(toastId);
    setLoadingInvoices(false);

    setInvoiceData(list); // Set to invoiceData
    setShowInvoicesDialog(true); // Open the dialog
    // Start enriching headings (Notes -> Heading) after we set the list
    if (list.length > 0) {
      enrichInvoiceHeadings(list);
    }

    if (list.length > 0) {
      showSuccess(`Loaded ${list.length} invoices`);
    } else {
      showError("No invoices found for this customer");
    }
  };

  // Load all transactions for a customer
  const loadTransactions = async () => {
    if (!num) return;
    setLoadingTransactions(true);
    const toastId = showLoading("Loading all transactions...");

    // Fetch all accounting entries (or a large page size)
    const { data, error } = await supabase.functions.invoke("economic-proxy", {
      body: { path: `/accounting/entries?pagesize=1000`, method: "GET" }, // Increased pagesize
    });
    dismissToast(toastId);

    if (error) {
      setLoadingTransactions(false);
      showError(error.message || "Failed to load transactions");
      return;
    }

    const allEntries = extractList(data);
    console.log("All entries fetched:", allEntries); // Debugging

    // Filter entries by customer number
    const customerTransactions = allEntries.filter(entry => {
      const entryCustomerNumber = pick(entry, [
        'customerNumber',
        'customer.customerNumber',
        'debtor.customerNumber', // Common for entries
        'debtor.number',
        'creditor.customerNumber', // If it's a credit entry
        'creditor.number',
      ]);
      return String(entryCustomerNumber ?? "") === String(num);
    });

    setTransactionsData(customerTransactions);
    setShowTransactionsDialog(true);
    setLoadingTransactions(false);

    if (customerTransactions.length > 0) {
      showSuccess(`Loaded ${customerTransactions.length} transactions`);
    } else {
      showError("No transactions found for this customer");
    }
  };

  // Load all outstanding transactions for a customer
  const loadOutstanding = async () => {
    if (!num) return;
    setLoadingOutstanding(true);
    const toastId = showLoading("Loading outstanding transactions...");

    // Fetch all accounting entries (or a large page size)
    const { data, error } = await supabase.functions.invoke("economic-proxy", {
      body: { path: `/accounting/entries?pagesize=1000`, method: "GET" }, // Increased pagesize
    });
    dismissToast(toastId);

    if (error) {
      setLoadingOutstanding(false);
      showError(error.message || "Failed to load outstanding transactions");
      return;
    }

    const allEntries = extractList(data);
    console.log("All entries fetched for outstanding:", allEntries); // Debugging

    const outstandingEntries = allEntries.filter(entry => {
      const entryCustomerNumber = pick(entry, [
        'customerNumber',
        'customer.customerNumber',
        'debtor.customerNumber',
        'debtor.number',
        'creditor.customerNumber',
        'creditor.number',
      ]);
      const remainingAmount = pick(entry, ['remainingAmount', 'remainingAmount.value', 'amount.remaining', 'balance']); // Added 'balance' as a candidate
      return String(entryCustomerNumber ?? "") === String(num) && typeof remainingAmount === 'number' && remainingAmount > 0;
    });

    setOutstandingData(outstandingEntries);
    setShowOutstandingDialog(true);
    setLoadingOutstanding(false);

    if (outstandingEntries.length > 0) {
      showSuccess(`Loaded ${outstandingEntries.length} outstanding transactions`);
    } else {
      showError("No outstanding transactions found for this customer");
    }
  };

  // Column definitions for the dialogs
  const invoiceColumns: DialogColumn[] = [
    { key: 'invoiceNumber', header: 'Invoice No.', path: ['invoiceNumber', 'bookedInvoiceNumber', 'draftInvoiceNumber', 'id', 'number', 'invoiceId'] },
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'bookedDate', 'issueDate', 'invoiceDate', 'createdAt'] },
    { key: 'amount', header: 'Amount', format: 'currencyAmount', path: ['amount', 'totalAmount', 'amount.value', 'grossAmount', 'amountIncludingVat', 'total', 'netAmount'] },
    { key: 'currency', header: 'Currency', path: ['currency', 'currency.code'] },
    { key: 'status', header: 'Status', path: ['status', 'state', 'booked', 'paymentStatus', 'invoiceStatus', 'draft', 'sent'] },
  ];

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


  return (
    <>
      <TableRow>
        <TableCell>{customer.customerNumber ?? "-"}</TableCell>
        <TableCell className="font-medium">{customer.name ?? "-"}</TableCell>
        <TableCell>{customer.email ?? "-"}</TableCell>
        <TableCell>{customer.phone ?? "-"}</TableCell>
        <TableCell>{customer.address?.city ?? "-"}</TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-2 items-center">
            <Button size="sm" variant="outline" onClick={() => setExpanded((e) => !e)}>
              {expanded ? "Hide" : "Details"}
            </Button>
            <Button size="sm" onClick={loadBalance} disabled={loadingBalance || !customer.customerNumber}>
              {loadingBalance ? "Loading..." : "Load Balance"}
            </Button>
            <Button size="sm" variant="outline" onClick={async () => {
              if (!num) return;
              console.log("Testing alternative endpoint for customer:", num);
              const { data, error } = await supabase.functions.invoke("economic-proxy", {
                body: { path: `/customers/${num}`, method: "GET" },
              });
              console.log("Customer detail response:", data);
              if (!error) {
                showSuccess("Customer details loaded - check console");
              } else {
                showError(error.message || "Failed to load customer details");
              }
            }} disabled={!customer.customerNumber}>
              Test Details
            </Button>
            <Button size="sm" variant="secondary" onClick={loadInvoices} disabled={loadingInvoices}>
              {loadingInvoices ? "Loading..." : "View Invoices"}
            </Button>
            {/* NEW: All Transactions Button */}
            <Button size="sm" variant="secondary" onClick={loadTransactions} disabled={loadingTransactions || !customer.customerNumber}>
              {loadingTransactions ? "Loading..." : "All Transactions"}
            </Button>
            {/* NEW: All Outstanding Button */}
            <Button size="sm" variant="secondary" onClick={loadOutstanding} disabled={loadingOutstanding || !customer.customerNumber}>
              {loadingOutstanding ? "Loading..." : "All Outstanding"}
            </Button>
            {balance !== null && (
              <Badge variant="secondary" className="ml-2">
                Balance: {formatAmount(balance)} {customer.currency || ''}
              </Badge>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6}>
            <div className="rounded-md bg-muted/30 p-4 space-y-3">
              <div className="text-sm text-muted-foreground">
                Source: <a href={customer.self} target="_blank" rel="noreferrer" className="underline">{customer.self || "N/A"}</a>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Street</div>
                  <div className="text-sm">{customer.address?.street ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Postal Code</div>
                  <div className="text-sm">{customer.address?.postalCode ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Country</div>
                  <div className="text-sm">{customer.address?.country ?? "-"}</div>
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}

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
      />
    </>
  );
};

export default Customers;