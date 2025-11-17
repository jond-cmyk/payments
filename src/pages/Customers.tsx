"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { showError, showLoading, showSuccess, dismissToast, showInfo } from "@/utils/toast";
import { List, FileText, BookText, ReceiptText, CalendarDays, AlertTriangle, Banknote } from "lucide-react";
import EconomicDetailDialog, { DialogColumn, extractList } from "@/components/economic/EconomicDetailDialog";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatAmount } from "@/components/economic/EconomicDetailDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import DatePicker from "@/components/DatePicker";
import { format, isWithinInterval, parseISO, isBefore } from "date-fns";
import { useCountry } from "@/integrations/supabase/CountryContext";
import CountrySelector from "@/components/CountrySelector";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import DepositReturnForm from "@/components/deposits/DepositReturnForm";
import { PaymentRequest } from "@/types/supabase";
import { exportToCsv } from "@/utils/exportToCsv";

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
  message?: string;
  developerHint?: string;
  httpStatusCode?: number;
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
    if (found && current !== undefined) {
      if (typeof current === "object" && current !== null && "value" in current && typeof current.value === "number") {
        return current.value;
      }
      return current;
    }
  }
  return undefined;
};

const CUSTOMER_RECEIVABLES_ACCOUNT_NUMBER = 5000;

const Customers: React.FC = () => {
  const { session, isLoading, userProfile } = useSession();
  const { currentCountry, setCurrentCountry, isCountryLocked, availableCountries } = useCountry();
  const navigate = useNavigate();

  const [pageSize, setPageSize] = useState<string>("25");
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);

  const isAdmin = userProfile?.role === "admin";

  const { data: allCustomersForFilter, isLoading: isLoadingAllCustomers } = useQuery<EconomicCustomer[]>({
    queryKey: ['allEconomicCustomersForFilter', currentCountry],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path: "/customers?pagesize=1000", method: "GET", country: currentCountry },
      });
      if (error) throw new Error(error.message);
      const resp = data as EconomicProxyResponse<any>;
      return extractList(resp?.data) as EconomicCustomer[];
    },
    enabled: !!session && currentCountry !== 'all',
    staleTime: 15 * 60 * 1000, // Cache for 15 minutes
  });

  // Main query for the table, now driven by the dropdown selection
  const customersQuery = useQuery({
    queryKey: ["economicCustomers", pageSize, currentCountry, selectedCustomer, currentPage],
    queryFn: async () => {
      if (selectedCustomer !== 'all') {
        // Fetch a single customer if one is selected
        const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
          body: { path: `/customers/${selectedCustomer}`, method: "GET", country: currentCountry },
        });
        if (error) throw new Error(error.message || "Failed to load customer");
        const resp = data as EconomicProxyResponse<EconomicCustomer>;
        setTotalCustomers(resp.data ? 1 : 0);
        return resp.data ? [resp.data] : [];
      } else {
        // Fetch a paginated list for "All Customers"
        const skipPages = currentPage - 1;
        const query: Record<string, string> = {
          pagesize: pageSize,
          skipPages: String(skipPages),
        };

        const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
          body: { path: "/customers", method: "GET", query, country: currentCountry },
        });

        if (error) throw new Error(error.message || "Failed to load customers");
        const resp = data as EconomicProxyResponse<EconomicCollection<EconomicCustomer>>;
        
        const total = resp?.data?.pagination?.results || 0;
        setTotalCustomers(total);

        const list = extractList(resp?.data);
        return list as EconomicCustomer[];
      }
    },
    enabled: !!session && currentCountry !== 'all',
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isLoading && !session) {
      navigate('/login');
    }
  }, [isLoading, session, navigate]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }
  if (!session) {
    return null; // Render nothing while redirecting
  }

  const totalPages = selectedCustomer !== 'all' ? 1 : Math.ceil(totalCustomers / parseInt(pageSize, 10));

  const renderPaginationItems = () => {
    const items = [];
    const maxPagesToShow = 5;
    const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (startPage > 1) {
      items.push(<PaginationItem key="1"><PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink></PaginationItem>);
      if (startPage > 2) {
        items.push(<PaginationItem key="ellipsis-start"><PaginationEllipsis /></PaginationItem>);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(<PaginationItem key={i}><PaginationLink isActive={i === currentPage} onClick={() => setCurrentPage(i)}>{i}</PaginationLink></PaginationItem>);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        items.push(<PaginationItem key="ellipsis-end"><PaginationEllipsis /></PaginationItem>);
      }
      items.push(<PaginationItem key={totalPages}><PaginationLink onClick={() => setCurrentPage(totalPages)}>{totalPages}</PaginationLink></PaginationItem>);
    }
    return items;
  };

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
            <div className="w-[200px]">
              <CountrySelector
                value={currentCountry}
                onValueChange={setCurrentCountry}
                disabled={isCountryLocked && !isAdmin}
                availableCountries={isAdmin ? availableCountries : availableCountries.filter(c => c.value === userProfile?.country)}
              />
            </div>
            <div className="flex-1 min-w-[250px]">
              <label htmlFor="customer-filter" className="block text-sm font-medium text-gray-700 mb-1">Filter by Customer</label>
              <Select value={selectedCustomer} onValueChange={(value) => { setSelectedCustomer(value); setCurrentPage(1); }} disabled={isLoadingAllCustomers || currentCountry === 'all'}>
                <SelectTrigger id="customer-filter">
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {allCustomersForFilter?.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => (
                    <SelectItem key={c.customerNumber} value={String(c.customerNumber)}>
                      {c.name} (#{c.customerNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[160px]">
              <label htmlFor="page-size-filter" className="block text-sm font-medium text-gray-700 mb-1">Page Size</label>
              <Select value={pageSize} onValueChange={setPageSize} disabled={selectedCustomer !== 'all' || currentCountry === 'all'}>
                <SelectTrigger id="page-size-filter">
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
              disabled={customersQuery.isFetching || currentCountry === 'all'}
              className="self-end"
            >
              Refresh
            </Button>
          </div>

          {currentCountry === 'all' && isAdmin ? (
            <Alert>
              <AlertTitle>Please Select a Country</AlertTitle>
              <AlertDescription>To view customer data from e-conomic, please select a specific country from the dropdown above.</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="relative overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead className="w-24">Number</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Balance</TableHead><TableHead>Overdue</TableHead><TableHead className="w-64">Actions</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {customersQuery.isLoading ? (
                      Array.from({ length: parseInt(pageSize, 10) }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={6}><div className="h-8 bg-gray-200 rounded animate-pulse" /></TableCell></TableRow>
                      ))
                    ) : (customersQuery.data || []).map((c, index) => (
                      <CustomerRow 
                        key={c.self ?? c.customerNumber ?? index} 
                        customer={c}
                        country={currentCountry}
                      />
                    ))}
                    {(customersQuery.data || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          {customersQuery.isFetching ? "Loading customers..." : "No customers found."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem><PaginationPrevious onClick={() => setCurrentPage(p => Math.max(1, p - 1))} /></PaginationItem>
                    {renderPaginationItems()}
                    <PaginationItem><PaginationNext onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} /></PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

interface CustomerRowProps {
  customer: EconomicCustomer;
  country: string;
}

const CustomerRow: React.FC<CustomerRowProps> = ({ customer, country }) => {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any[] | null>(null);
  const [showInvoicesDialog, setShowInvoicesDialog] = useState(false);
  const [invoiceHeadings, setInvoiceHeadings] = useState<Record<string, string>>({});
  
  const [showLedgerCardDialog, setShowLedgerCardDialog] = useState(false);
  const [accountingYears, setAccountingYears] = useState<{ year: string }[]>([]);
  const [selectedAccountingYear, setSelectedAccountingYear] = useState<string | null>(null);
  const [loadingLedgerCard, setLoadingLedgerCard] = useState(false);

  const [loadingOutstanding, setLoadingOutstanding] = useState(false);
  const [outstandingData, setOutstandingData] = useState<any[] | null>(null);
  const [showOutstandingDialog, setShowOutstandingDialog] = useState(false);

  const [showDepositReturnDialog, setShowDepositReturnDialog] = useState(false);
  const [isSubmittingDepositReturn, setIsSubmittingDepositReturn] = useState(false);

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDialogContent, setStatusDialogContent] = useState<{ title: string; message: string }>({ title: '', message: '' });

  const num = customer.customerNumber;

  const { data: balancesByCurrencyData, isLoading: loadingBalances, error: balancesError } = useQuery<{
    balances: Record<string, { total: number; overdue: number }>;
  }>({
    queryKey: ["customerBalancesByCurrency", num, country],
    queryFn: async () => {
      if (!num) return { balances: {} };

      const { data: yearsData, error: yearsError } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path: "/accounting-years", method: "GET", country },
      });
      if (yearsError) throw new Error(yearsError.message);
      const yearsResponse = yearsData as EconomicProxyResponse<any>;
      if (!yearsResponse.ok) throw new Error("Failed to fetch accounting years.");
      const yearsList = extractList(yearsResponse.data);
      if (!yearsList || yearsList.length === 0) return { balances: {} };

      let allEntries: any[] = [];
      const filter = `customer.customerNumber$eq:${num}$and:remainder$ne:0`;

      const yearPromises = yearsList.map(yearInfo => {
        const year = yearInfo.year;
        const path = `/accounting-years/${year}/entries?pagesize=1000&filter=${filter}`;
        return supabase.functions.invoke("economic-api-proxy", { body: { path, method: "GET", country } });
      });

      const yearResults = await Promise.all(yearPromises);

      for (const result of yearResults) {
        if (result.error) {
          console.warn("Error fetching entries for a year:", result.error.message);
          continue;
        }
        const resp = result.data as EconomicProxyResponse<any>;
        if (resp.ok) {
          const entriesForYear = extractList(resp?.data);
          if (entriesForYear && entriesForYear.length > 0) {
            allEntries = allEntries.concat(entriesForYear);
          }
        }
      }

      const balances: Record<string, { total: number; overdue: number }> = {};
      const now = new Date();

      allEntries.forEach(entry => {
        const currency = pick(entry, ['currency', 'currency.code']) || 'N/A';
        const remainder = parseFloat(String(pick(entry, ['remainder']))) || 0;
        const dueDateStr = pick(entry, ['dueDate']);
        const isOverdue = dueDateStr ? isBefore(parseISO(dueDateStr), now) : false;

        if (!balances[currency]) {
          balances[currency] = { total: 0, overdue: 0 };
        }
        balances[currency].total += remainder;
        if (isOverdue) {
          balances[currency].overdue += remainder;
        }
      });

      return { balances };
    },
    enabled: !!num,
    staleTime: 5 * 60 * 1000,
  });

  const { data: existingDepositReturns } = useQuery<PaymentRequest[]>({
    queryKey: ['existingDepositReturnsForCustomer', num, country],
    queryFn: async () => {
        if (!num) return [];
        const { data, error } = await supabase
            .from('payment_requests')
            .select('*')
            .eq('is_deposit_return', true)
            .not('status', 'eq', 'declined')
            .ilike('supplier_name', `%#${num}%`); // Search for customer number in name
        if (error) throw error;
        return data;
    },
    enabled: !!num,
  });

  const hasActiveReturnRequest = existingDepositReturns && existingDepositReturns.length > 0;
  
  const firstCreditBalance = useMemo(() => {
    if (!balancesByCurrencyData?.balances) return null;
    const creditEntry = Object.entries(balancesByCurrencyData.balances).find(([, { total }]) => total < 0);
    return creditEntry ? { currency: creditEntry[0], amount: creditEntry[1].total } : null;
  }, [balancesByCurrencyData]);

  const hasCreditBalance = !!firstCreditBalance;

  const handleCreateDepositReturnRequest = async (formValues: any) => {
    if (!user || !customer.customerNumber || !firstCreditBalance) return;
    setIsSubmittingDepositReturn(true);
    const toastId = showLoading("Creating deposit return request...");

    try {
      const customerAddress = [
        customer.address?.street,
        customer.address?.city,
        customer.address?.postalCode,
        customer.country,
      ].filter(Boolean).join(', ');

      const { error } = await supabase.from('payment_requests').insert({
        requester_id: user.id,
        supplier_name: `${customer.name} #${customer.customerNumber}`,
        supplier_address: customerAddress || 'Address not available in e-conomic',
        currency: firstCreditBalance.currency,
        total_amount: Math.abs(firstCreditBalance.amount),
        reason_for_payment: `Deposit Return for Customer #${customer.customerNumber}`,
        date_payment_required: new Date().toISOString().split('T')[0],
        status: 'pending',
        country: country,
        is_deposit_return: true,
        not_sku_related: true,
        categories: [{ category: '8201_customer_deposit', amount: Math.abs(firstCreditBalance.amount) }],
        invoice_pdf_urls: [],
        bank_details_verified: formValues.bank_details_verified,
        bank_account_name: formValues.bank_account_name,
        iban_number: formValues.iban_number,
        sort_code: null,
        account_number: null,
      });

      if (error) throw error;

      dismissToast(toastId);
      showSuccess("Deposit return request created successfully!");
      setShowDepositReturnDialog(false);
      queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] });
      queryClient.invalidateQueries({ queryKey: ['allPaymentRequestsForSummary'] });
      queryClient.invalidateQueries({ queryKey: ['existingDepositReturnsForCustomer', num, country] });
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to create request.");
    } finally {
      setIsSubmittingDepositReturn(false);
    }
  };

  const { data: ledgerCardData, isLoading: isLedgerLoading } = useQuery({
    queryKey: ['customerLedgerEntries', num, selectedAccountingYear, country],
    queryFn: async () => {
      if (!num || !selectedAccountingYear) return [];
      const potentialPaths = [
        `/customer-ledger-entries?filter=customer.customerNumber$eq:${num}&pagesize=1000`,
        `/accounts/${CUSTOMER_RECEIVABLES_ACCOUNT_NUMBER}/accounting-years/${selectedAccountingYear}/entries?filter=customer.customerNumber$eq:${num}&pagesize=1000`,
        `/accounting-years/${selectedAccountingYear}/entries?filter=customer.customerNumber$eq:${num}&pagesize=1000`,
        `/entries?filter=customer.customerNumber$eq:${num}&pagesize=1000`
      ];
      for (const path of potentialPaths) {
        const { data, error } = await supabase.functions.invoke("economic-api-proxy", { body: { path, method: "GET", country } });
        if (!error && data) {
          const resp = data as EconomicProxyResponse<any>;
          if (resp.ok) {
            const extracted = extractList(resp.data);
            if (extracted && extracted.length > 0) return extracted;
          }
        }
      }
      throw new Error("No ledger entries found after trying all available endpoints.");
    },
    enabled: !!num && !!selectedAccountingYear && showLedgerCardDialog,
  });

  const pathFromSelf = (self: string): string | undefined => {
    if (typeof self !== "string" || !self) return undefined;
    if (self.startsWith("http")) {
      const parts = self.split("/");
      return "/" + parts.slice(3).join("/");
    }
    return self.startsWith("/") ? self : "/" + self;
  };

  const getInvoiceKey = (inv: any): string => inv?.self || inv?.bookedInvoiceNumber || inv?.invoiceNumber || inv?.id || JSON.stringify(inv);
  const getInvoiceDescription = useCallback((inv: any): string => pick(inv, ['description', 'text', 'notes.text', 'notes.heading', 'heading', 'title', 'recipient.name', 'customer.name']) || "-", []);

  const fetchHeadingForInvoice = useCallback(async (inv: any) => {
    const path = pathFromSelf(inv?.self) ?? (inv?.bookedInvoiceNumber ? `/invoices/booked/${inv.bookedInvoiceNumber}` : undefined);
    if (!path) return;
    const { data, error } = await supabase.functions.invoke("economic-api-proxy", { body: { path, method: "GET", country } });
    if (error || !data) return;
    const root = (data as any)?.data ?? data;
    const found = pick(root, ['notes.heading', 'heading', 'title', 'description', 'text', 'recipient.name', 'customer.name']) || getInvoiceDescription(root);
    if (found && found !== "-") setInvoiceHeadings((prev) => ({ ...prev, [getInvoiceKey(inv)]: found }));
  }, [getInvoiceDescription, country]);

  const enrichInvoiceHeadings = useCallback(async (list: any[]) => {
    list.forEach(inv => {
      const key = getInvoiceKey(inv);
      if (!invoiceHeadings[key]) {
        const basic = getInvoiceDescription(inv);
        if (basic && basic !== "-") setInvoiceHeadings((prev) => ({ ...prev, [key]: basic }));
        else fetchHeadingForInvoice(inv);
      }
    });
  }, [invoiceHeadings, getInvoiceDescription, fetchHeadingForInvoice]);

  const viewInvoice = useCallback(async (item: any) => {
    try {
      let basePath: string | undefined;
      const invoiceObject = item.invoice || item;

      // Priority 1: Use the 'self' link if it exists and is valid.
      const selfLink = pick(invoiceObject, ['self']);
      if (selfLink && typeof selfLink === 'string') {
        const path = pathFromSelf(selfLink);
        if (path && (path.includes('/invoices/booked/') || path.includes('/invoices/drafts/'))) {
          basePath = path;
        }
      }

      // Priority 2: Look for a booked invoice number
      if (!basePath) {
        const bookedInvoiceNumber = pick(invoiceObject, ['bookedInvoiceNumber']);
        if (bookedInvoiceNumber) {
          basePath = `/invoices/booked/${bookedInvoiceNumber}`;
        }
      }

      // Priority 3: Look for a draft invoice number
      if (!basePath) {
        const draftInvoiceNumber = pick(invoiceObject, ['draftInvoiceNumber']);
        if (draftInvoiceNumber) {
          basePath = `/invoices/drafts/${draftInvoiceNumber}`;
        }
      }

      // Priority 4 (Fallback): Look for a generic invoice number and assume it's booked
      if (!basePath) {
        const genericInvoiceNumber = pick(item, ['invoiceNumber', 'invoice.invoiceNumber']);
        if (genericInvoiceNumber) {
          basePath = `/invoices/booked/${genericInvoiceNumber}`;
        }
      }
      
      if (!basePath) {
        console.error("Failed to determine invoice path from item:", item);
        throw new Error("Could not determine a valid invoice path for this entry.");
      }

      const pdfPath = `${basePath}/pdf`;
      const proxyUrl = `https://vcpvwcfuvpngmxenhixj.supabase.co/functions/v1/economic-pdf-proxy?path=${encodeURIComponent(pdfPath)}&country=${encodeURIComponent(country)}`;

      window.open(proxyUrl, '_blank');
    } catch (e: any) {
      showError(e.message);
    }
  }, [country]);

  const checkPaymentStatus = useCallback(async (invoice: any) => {
    const toastId = showLoading("Checking payment status...");
    try {
        const path = pathFromSelf(invoice?.self) ?? (invoice?.bookedInvoiceNumber ? `/invoices/booked/${invoice.bookedInvoiceNumber}` : undefined);
        if (!path) {
            throw new Error("Could not determine invoice path.");
        }

        const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
            body: { path, method: "GET", country },
        });

        if (error) throw error;
        const resp = data as EconomicProxyResponse<any>;
        if (resp.error || !resp.ok) {
            throw new Error(resp.error || `e-conomic API returned status ${resp.status}`);
        }

        const invoiceDetails = resp.data;
        const remainder = pick(invoiceDetails, ['remainder', 'remainingAmount']);
        const currency = pick(invoiceDetails, ['currency']);

        if (remainder !== undefined && remainder !== null) {
            if (parseFloat(remainder) === 0) {
                setStatusDialogContent({
                    title: "Payment Status: Paid",
                    message: "This invoice is fully paid."
                });
            } else {
                setStatusDialogContent({
                    title: "Payment Status: Outstanding Balance",
                    message: `This invoice has a remaining balance of ${formatAmount(remainder)} ${currency}.`
                });
            }
        } else {
            setStatusDialogContent({
                title: "Payment Status: Unknown",
                message: "Payment status information not available on this invoice record."
            });
        }
        setStatusDialogOpen(true);
        dismissToast(toastId);
    } catch (e: any) {
        dismissToast(toastId);
        showError(e.message || "Failed to check payment status.");
    }
  }, [country]);

  const loadInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    const toastId = showLoading("Loading invoices...");
    let list: any[] = [];
    const paths = num ? [`/customers/${num}/invoices?pagesize=100`, `/customers/${num}/invoices/booked?pagesize=100`] : [`/invoices?pagesize=100`, `/invoices/booked?pagesize=100`];
    for (const path of paths) {
      const { data, error } = await supabase.functions.invoke("economic-api-proxy", { body: { path, method: "GET", country } });
      if (!error && data) {
        const arr = extractList(data);
        if (arr.length > 0) { list = [...list, ...arr]; }
      }
    }
    if (num != null && list.length > 0) {
      list = list.filter((inv: any) => String(pick(inv, ["customerNumber", "customer.customerNumber", "customer.number", "customer_id"]) ?? "") === String(num));
    }
    dismissToast(toastId);
    setLoadingInvoices(false);
    setInvoiceData(list);
    setShowInvoicesDialog(true);
    if (list.length > 0) { enrichInvoiceHeadings(list); showSuccess(`Loaded ${list.length} invoices`); }
    else { showError("No invoices found for this customer"); }
  }, [num, enrichInvoiceHeadings, country]);

  const loadLedgerCard = useCallback(async () => {
    if (!num) { showError("Customer number is missing."); return; }
    setLoadingLedgerCard(true);
    const toastId = showLoading(`Loading accounting years...`);
    try {
      const { data: yearsData, error: yearsError } = await supabase.functions.invoke("economic-api-proxy", { body: { path: "/accounting-years", method: "GET", country } });
      if (yearsError) throw new Error(yearsError.message);
      const yearsResponse = yearsData as EconomicProxyResponse<any>;
      if (!yearsResponse.ok) throw new Error("Failed to fetch accounting years.");
      const yearsList = extractList(yearsResponse.data);
      setAccountingYears(yearsList);
      const today = new Date();
      const currentYearObject = yearsList.find(y => {
        const from = y.fromDate ? parseISO(y.fromDate) : null;
        const to = y.toDate ? parseISO(y.toDate) : null;
        return from && to && isWithinInterval(today, { start: from, end: to });
      });
      if (currentYearObject?.year) setSelectedAccountingYear(currentYearObject.year);
      else if (yearsList.length > 0) setSelectedAccountingYear(yearsList[0].year);
      else throw new Error("No accounting years found.");
      setShowLedgerCardDialog(true);
      dismissToast(toastId);
    } catch (err: any) {
      dismissToast(toastId);
      showError("Failed to load accounting years: " + err.message);
    } finally {
      setLoadingLedgerCard(false);
    }
  }, [num, country]);

  const loadOutstandingTransactions = useCallback(async () => {
    if (!num) { showError("Customer number is missing."); return; }
    setLoadingOutstanding(true);
    const toastId = showLoading(`Loading outstanding transactions...`);
    try {
      const { data: yearsData, error: yearsError } = await supabase.functions.invoke("economic-api-proxy", { body: { path: "/accounting-years", method: "GET", country } });
      if (yearsError) throw new Error(yearsError.message);
      const yearsResponse = yearsData as EconomicProxyResponse<any>;
      if (!yearsResponse.ok) throw new Error("Failed to fetch accounting years.");
      const yearsList = extractList(yearsResponse.data);
      if (!yearsList || yearsList.length === 0) throw new Error("No accounting years found.");

      let allEntries: any[] = [];
      const filter = `customer.customerNumber$eq:${num}$and:remainder$ne:0`;

      const yearPromises = yearsList.map(yearInfo => {
        const year = yearInfo.year;
        const path = `/accounting-years/${year}/entries?pagesize=1000&filter=${filter}`;
        return supabase.functions.invoke("economic-api-proxy", { body: { path, method: "GET", country } });
      });

      const yearResults = await Promise.all(yearPromises);

      for (const result of yearResults) {
        if (result.error) {
          console.warn("Error fetching entries for a year:", result.error.message);
          continue;
        }
        const resp = result.data as EconomicProxyResponse<any>;
        if (resp.ok) {
          const entriesForYear = extractList(resp?.data);
          if (entriesForYear && entriesForYear.length > 0) {
            allEntries = allEntries.concat(entriesForYear);
          }
        }
      }

      setOutstandingData(allEntries);
      setShowOutstandingDialog(true);
      if (allEntries.length > 0) {
        enrichInvoiceHeadings(allEntries);
        showSuccess(`Found ${allEntries.length} outstanding transactions.`);
      } else {
        showInfo("No outstanding transactions found for this customer.");
      }
      dismissToast(toastId);
    } catch (err: any) {
      dismissToast(toastId);
      showError("Failed to load outstanding transactions: " + err.message);
    } finally {
      setLoadingOutstanding(false);
    }
  }, [num, country, enrichInvoiceHeadings]);

  const handleExport = (dataToExport: any[], columns: DialogColumn[], baseFilename: string) => {
    if (!dataToExport || dataToExport.length === 0) {
      showError(`No ${baseFilename.replace(/_/g, ' ')} data to export.`);
      return;
    }
  
    const columnsForExport = columns.filter(c => !c.render);
  
    const flattenedData = dataToExport.map(item => {
      const flatItem: Record<string, any> = {};
      columnsForExport.forEach(col => {
        flatItem[col.header] = pick(item, col.path || [col.key]);
      });
      // Add currency column
      const currency = pick(item, ['currency.code', 'currency', 'customer.currency.code', 'customer.currency']);
      flatItem['Currency'] = currency || '';
      return flatItem;
    });
  
    const filename = `${baseFilename}_${customer.customerNumber}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    
    exportToCsv(flattenedData, filename);
  };

  const invoiceColumns: DialogColumn[] = useMemo(() => [
    { key: 'invoiceNumber', header: 'Invoice No.', path: ['invoiceNumber', 'bookedInvoiceNumber', 'draftInvoiceNumber', 'id', 'number', 'invoiceId'] },
    { key: 'text', header: 'Text', path: ['description', 'text', 'notes.text', 'notes.heading', 'heading', 'title', 'recipient.name', 'customer.name'], render: (item) => invoiceHeadings[getInvoiceKey(item)] || getInvoiceDescription(item) },
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'bookedDate', 'issueDate', 'invoiceDate', 'createdAt'] },
    { key: 'amount', header: 'Amount', format: 'currencyAmount', path: ['amount', 'totalAmount', 'amount.value', 'grossAmount', 'amountIncludingVat', 'total', 'netAmount'] },
    { key: 'currency', header: 'Currency', path: ['currency', 'currency.code'] },
    { key: 'status', header: 'Status', path: ['status.state', 'status.value', 'status', 'state', 'booked', 'paymentStatus', 'invoiceStatus', 'draft', 'sent'] },
    { 
      key: 'actions', 
      header: 'Actions', 
      render: (item) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => viewInvoice(item)} className="flex items-center gap-1"><FileText className="h-4 w-4 mr-1" /> View Invoice</Button>
          <Button size="sm" variant="secondary" onClick={() => checkPaymentStatus(item)} className="flex items-center gap-1"><Banknote className="h-4 w-4 mr-1" /> Check Status</Button>
        </div>
      ) 
    },
  ], [invoiceHeadings, viewInvoice, getInvoiceDescription, checkPaymentStatus]);

  const ledgerCardColumns: DialogColumn[] = [
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'entryDate', 'transactionDate', 'createdAt'] },
    { key: 'entryNumber', header: 'Entry No.', path: ['entryNumber', 'number', 'id'] },
    { key: 'entryType', header: 'Entry Type', path: ['entryType', 'type'] },
    { key: 'invoiceNumber', header: 'Invoice No.', path: ['invoiceNumber', 'invoice.bookedInvoiceNumber', 'invoice.invoiceNumber', 'invoice.id', 'invoice.number'] },
    { key: 'text', header: 'Text', path: ['text', 'description', 'notes.text', 'notes.heading'] },
    { key: 'amount', header: 'Amount', format: 'currencyAmount', path: ['amount', 'amount.value', 'totalAmount', 'grossAmount'] },
    { key: 'dueDate', header: 'Due Date', format: 'date', path: ['dueDate', 'paymentTerms.dueDate'] },
  ];

  const outstandingColumns: DialogColumn[] = useMemo(() => [
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'entryDate'] },
    { key: 'entryNumber', header: 'Entry No.', path: ['entryNumber'] },
    { key: 'entryType', header: 'Entry Type', path: ['entryType', 'type'] },
    { key: 'invoiceNumber', header: 'Invoice No.', path: ['invoice.bookedInvoiceNumber', 'invoiceNumber', 'invoice.invoiceNumber', 'invoice.id', 'invoice.number'] },
    { key: 'text', header: 'Text', path: ['text'], render: (item) => invoiceHeadings[getInvoiceKey(item)] || getInvoiceDescription(item) },
    { key: 'amount', header: 'Total Amount', format: 'currencyAmount', path: ['amount'] },
    { key: 'remainder', header: 'Outstanding', format: 'currencyAmount', path: ['remainder'] },
    { key: 'dueDate', header: 'Due Date', format: 'date', path: ['dueDate'] },
    {
      key: 'pdf',
      header: 'PDF',
      render: (item) => {
        if (item.entryType === 'customerPayment') {
          return null;
        }
        return (
          <Button size="sm" variant="outline" onClick={() => viewInvoice(item)} className="flex items-center gap-1">
            <FileText className="h-4 w-4 mr-1" /> View Invoice
          </Button>
        );
      },
    },
  ], [invoiceHeadings, viewInvoice, getInvoiceDescription]);

  const ledgerDialogDescription = (
    <div className="flex items-center justify-between">
      <span>{`Showing all ledger entries for customer number ${customer.customerNumber}.`}</span>
      {accountingYears.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Accounting Year:</label>
          <Select value={selectedAccountingYear || ''} onValueChange={setSelectedAccountingYear}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select year" /></SelectTrigger>
            <SelectContent>{accountingYears.map(y => <SelectItem key={y.year} value={y.year}>{y.year}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  const isCustomerNumberMissing = !customer.customerNumber;
  const isLedgerButtonLoading = loadingLedgerCard || isLedgerLoading;

  return (
    <>
      <TableRow>
        <TableCell>{customer.customerNumber ?? "-"}</TableCell>
        <TableCell className="font-medium">{customer.name ?? "-"}</TableCell>
        <TableCell>{customer.email ?? "-"}</TableCell>
        <TableCell>
          {loadingBalances ? "..." : balancesError ? <span className="text-red-500">Error</span> : 
            balancesByCurrencyData?.balances && Object.keys(balancesByCurrencyData.balances).length > 0 ? (
              <div className="flex flex-col gap-1 items-start">
                {Object.entries(balancesByCurrencyData.balances).map(([currency, { total }]) => (
                  <Badge key={currency} className={cn("text-base px-2 py-1 whitespace-nowrap", total < 0 ? "bg-green-600 text-white" : "bg-dyad-blue text-white")}>
                    {formatAmount(total)} {currency}
                  </Badge>
                ))}
              </div>
            ) : "0.00"
          }
        </TableCell>
        <TableCell>
          {loadingBalances ? "..." : balancesError ? <span className="text-red-500">Error</span> : 
            balancesByCurrencyData?.balances && Object.values(balancesByCurrencyData.balances).some(b => b.overdue > 0) ? (
              <div className="flex flex-col gap-1 items-start">
                {Object.entries(balancesByCurrencyData.balances).filter(([, { overdue }]) => overdue > 0).map(([currency, { overdue }]) => (
                  <Badge key={currency} variant="destructive" className="text-base px-2 py-1 whitespace-nowrap">
                    {formatAmount(overdue)} {currency}
                  </Badge>
                ))}
              </div>
            ) : "-"
          }
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-2">
            <Button size="sm" className="flex-1 bg-dyad-blue hover:bg-dyad-blue-light text-white" onClick={loadInvoices} disabled={loadingInvoices}>{loadingInvoices ? "Loading..." : "View Invoices"}</Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" className="flex-1 bg-dyad-blue hover:bg-dyad-blue-light text-white" onClick={loadLedgerCard} disabled={isCustomerNumberMissing || isLedgerButtonLoading}>
                  <BookText className="h-4 w-4 mr-1" /> {isLedgerButtonLoading ? "Loading..." : "Ledger Card"}
                </Button>
              </TooltipTrigger>
              {isCustomerNumberMissing && <TooltipContent>This customer has no associated customer number in e-conomic.</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="destructive" className="flex-1" onClick={loadOutstandingTransactions} disabled={isCustomerNumberMissing || loadingOutstanding}>
                  <ReceiptText className="h-4 w-4 mr-1" /> {loadingOutstanding ? "Loading..." : "Outstanding"}
                </Button>
              </TooltipTrigger>
              {isCustomerNumberMissing && <TooltipContent>This customer has no associated customer number in e-conomic.</TooltipContent>}
            </Tooltip>
            {hasCreditBalance && (
              hasActiveReturnRequest ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" className="w-full justify-center py-2">Request Pending</Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>A deposit return request for this customer already exists.</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Button size="sm" variant="secondary" className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => setShowDepositReturnDialog(true)}>
                  Request Deposit Return
                </Button>
              )
            )}
          </div>
        </TableCell>
      </TableRow>
      <EconomicDetailDialog isOpen={showInvoicesDialog} onOpenChange={setShowInvoicesDialog} title={`Invoices for ${customer.name || 'Customer'}`} description={`Showing all invoices for customer number ${customer.customerNumber}.`} data={invoiceData} columns={invoiceColumns} isLoading={loadingInvoices} defaultSort={{ key: 'date', direction: 'descending' }} onExport={(data) => handleExport(data, invoiceColumns, 'invoices')} />
      <EconomicDetailDialog isOpen={showLedgerCardDialog} onOpenChange={setShowLedgerCardDialog} title={`Ledger Card for ${customer.name || 'Customer'}`} description={ledgerDialogDescription} data={ledgerCardData as any[]} columns={ledgerCardColumns} isLoading={isLedgerLoading} defaultSort={{ key: 'date', direction: 'descending' }} onExport={(data) => handleExport(data, ledgerCardColumns, `ledger-card_${selectedAccountingYear}`)} />
      <EconomicDetailDialog 
        isOpen={showOutstandingDialog} 
        onOpenChange={setShowOutstandingDialog} 
        title={`Outstanding Transactions for ${customer.name || 'Customer'}`} 
        description={`Showing all transactions with an outstanding balance for customer number ${customer.customerNumber}.`} 
        data={outstandingData} 
        columns={outstandingColumns} 
        isLoading={loadingOutstanding} 
        defaultSort={{ key: 'date', direction: 'descending' }}
        onExport={(data) => handleExport(data, outstandingColumns, 'outstanding')}
      />
      {hasCreditBalance && firstCreditBalance && (
        <Dialog open={showDepositReturnDialog} onOpenChange={setShowDepositReturnDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Deposit Return</DialogTitle>
              <DialogDescription>
                This customer has a credit balance of {formatAmount(firstCreditBalance.amount)} {firstCreditBalance.currency}. Please provide their bank details for the repayment.
              </DialogDescription>
            </DialogHeader>
            <DepositReturnForm
              customerName={`${customer.name} #${customer.customerNumber}`}
              returnAmount={Math.abs(firstCreditBalance.amount)}
              currency={firstCreditBalance.currency}
              onSubmit={handleCreateDepositReturnRequest}
              isSubmitting={isSubmittingDepositReturn}
            />
          </DialogContent>
        </Dialog>
      )}
      <AlertDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{statusDialogContent.title}</AlertDialogTitle>
            <AlertDialogDescription className="pt-4 text-base">
              {statusDialogContent.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setStatusDialogOpen(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Customers;