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
  const { session, isLoading, userProfile } = useSession();
  const navigate = useNavigate();
  const isAdmin = userProfile?.role === "admin";

  const [pageSize, setPageSize] = useState<string>("25");
  const [search, setSearch] = useState<string>("");

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }
  if (!session) {
    navigate("/login");
    return null;
  }
  if (!isAdmin) {
    showError("You do not have permission to view Customers.");
    navigate("/dashboard");
    return null;
  }

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

const CustomerRow: React.FC<{ customer: EconomicCustomer }> = ({ customer }) => {
  const [expanded, setExpanded] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [invoices, setInvoices] = useState<any[] | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

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

    const { data, error } = await supabase.functions.invoke("economic-proxy", {
      body: { path: basePath, method: "GET" },
    });
    dismissToast(toastId);

    if (error || !data) {
      showError(error?.message || "Failed to fetch invoice details");
      return;
    }

    const resp = data as any;
    const root = resp?.data ?? data;

    const candidates = [
      root?.pdf,
      root?.pdf?.url,
      root?.pdf?.href,
      root?.pdf?.download,
      root?.pdf?.downloadUrl,
      root?.links?.pdf,
      root?.links?.pdf?.href,
    ];

    let pdfUrl: string | undefined;
    for (const c of candidates) {
      if (typeof c === "string" && c.trim() !== "") {
        pdfUrl = c;
        break;
      }
    }

    // If pdf is an object, try any string value inside it
    if (!pdfUrl && typeof root?.pdf === "object" && root?.pdf) {
      for (const val of Object.values(root.pdf)) {
        if (typeof val === "string" && val.trim() !== "") {
          pdfUrl = val as string;
          break;
        }
      }
    }

    // Fallback: try /pdf subresource via proxy
    if (!pdfUrl) {
      const pdfPath = basePath.endsWith("/pdf") ? basePath : `${basePath}/pdf`;
      const { data: pdfData, error: pdfErr } = await supabase.functions.invoke("economic-proxy", {
        body: { path: pdfPath, method: "GET" },
      });
      if (!pdfErr && pdfData) {
        const resp2 = pdfData as any;
        const root2 = resp2?.data ?? pdfData;

        const moreCandidates = [
          root2?.url,
          root2?.href,
          root2?.download,
          root2?.downloadUrl,
          root2?.link,
        ];
        for (const c of moreCandidates) {
          if (typeof c === "string" && c.trim() !== "") {
            pdfUrl = c;
            break;
          }
        }

        // If Unauthorized, try demo fallback
        if (!pdfUrl && resp2?.status === 401) {
          const demoLink = root2?.demoLink;
          if (typeof demoLink === "string" && demoLink.trim() !== "") {
            try {
              window.open(demoLink, "_blank");
              showSuccess("Opening demo invoice PDF");
              return;
            } catch {
              // ignore window.open errors
            }
          }
          // Attempt fetching with ?demo=true to get a public demo URL
          const { data: demoData } = await supabase.functions.invoke("economic-proxy", {
            body: { path: `${pdfPath}?demo=true`, method: "GET" },
          });
          if (demoData) {
            const demoResp = demoData as any;
            const demoRoot = demoResp?.data ?? demoData;
            const demoCandidates = [demoRoot?.url, demoRoot?.href, demoRoot?.download, demoRoot?.downloadUrl, demoRoot?.link];
            for (const c of demoCandidates) {
              if (typeof c === "string" && c.trim() !== "") {
                pdfUrl = c;
                break;
              }
            }
            if (pdfUrl) {
              try {
                window.open(pdfUrl, "_blank");
                showSuccess("Opening demo invoice PDF");
                return;
              } catch {
                // ignore window.open errors
              }
            }
          }
          showError("Unauthorized to access invoice PDF. Check ECONOMIC_APP_SECRET_TOKEN and ECONOMIC_AGREEMENT_GRANT_TOKEN in Supabase Secrets.");
          return;
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
    } catch {
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

    setInvoices(list);
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
            {balance !== null && (
              <Badge variant="secondary" className="ml-2">
                Balance: {balance}
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

              {invoices && (
                <div className="mt-4">
                  <div className="font-medium mb-2">Invoices</div>
                  <div className="relative overflow-x-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice No.</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                              No invoices found for this customer.
                            </TableCell>
                          </TableRow>
                        )}
                        {invoices.map((inv: any) => {
                          console.log("Raw invoice object:", inv);
                          console.log("Invoice heading field:", inv.heading);
                          console.log("Invoice layout object:", inv.layout);
                          console.log("All invoice keys:", Object.keys(inv));
                          return (
                            <TableRow key={inv?.invoiceNumber ?? inv?.id ?? Math.random()}>
                              <TableCell>
                                {pick(inv, ["invoiceNumber", "bookedInvoiceNumber", "draftInvoiceNumber", "id", "number", "invoiceId", "self"]) ?? "-"}
                              </TableCell>
                              <TableCell>{formatDate(pick(inv, ["date", "bookedDate", "issueDate", "invoiceDate", "createdAt"]))}</TableCell>
                              <TableCell>
                                {formatAmount(pick(inv, ["amount", "totalAmount", "amount.value", "grossAmount", "amountIncludingVat", "total", "netAmount"]))}
                              </TableCell>
                              <TableCell>{pick(inv, ["status", "state", "booked", "paymentStatus", "invoiceStatus", "draft", "sent"]) ?? "-"}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button size="sm" variant="outline" onClick={() => viewInvoice(inv)}>
                                    View Invoice
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

export default Customers;