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

  const num = customer.customerNumber;

  const loadBalance = async () => {
    if (!num) return;
    setLoadingBalance(true);
    const toastId = showLoading("Loading balance...");
    const { data, error } = await supabase.functions.invoke("economic-proxy", {
      body: { path: `/customers/${num}/totals`, method: "GET" },
    });
    dismissToast(toastId);
    setLoadingBalance(false);
    if (error) {
      showError(error.message || "Failed to load balance");
      return;
    }
    const resp = data as EconomicProxyResponse<any>;
    const val =
      typeof resp?.data?.balance === "number"
        ? resp.data.balance
        : typeof resp?.data?.totals?.balance === "number"
        ? resp.data.totals.balance
        : null;
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
    // Fetch a page of invoices, then filter by customerNumber if present
    const { data, error } = await supabase.functions.invoke("economic-proxy", {
      body: { path: `/invoices?pagesize=100`, method: "GET" },
    });
    dismissToast(toastId);
    setLoadingInvoices(false);
    if (error) {
      showError(error.message || "Failed to load invoices");
      return;
    }
    const resp = data as EconomicProxyResponse<EconomicCollection<any>>;
    const list = Array.isArray(resp?.data?.collection)
      ? resp.data.collection
      : Array.isArray(resp?.data)
      ? (resp.data as any[])
      : [];
    const filtered =
      num != null
        ? list.filter((inv: any) => {
            const cn =
              inv?.customerNumber ??
              inv?.customer?.customerNumber ??
              inv?.customer?.number ??
              inv?.customer_id;
            return String(cn || "") === String(num);
          })
        : list;
    setInvoices(filtered);
    showSuccess(`Loaded ${filtered.length} invoices`);
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
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              No invoices found for this customer.
                            </TableCell>
                          </TableRow>
                        )}
                        {invoices.map((inv: any) => (
                          <TableRow key={inv?.invoiceNumber ?? inv?.id ?? Math.random()}>
                            <TableCell>{inv?.invoiceNumber ?? inv?.id ?? "-"}</TableCell>
                            <TableCell>{inv?.date ?? inv?.bookedDate ?? "-"}</TableCell>
                            <TableCell>{inv?.amount ?? inv?.totalAmount ?? "-"}</TableCell>
                            <TableCell>{inv?.status ?? inv?.state ?? "-"}</TableCell>
                          </TableRow>
                        ))}
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