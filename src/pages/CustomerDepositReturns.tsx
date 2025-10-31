"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isWithinInterval, parseISO } from 'date-fns';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Home, FileText, Search, Filter, RotateCcw, AlertTriangle } from 'lucide-react';
import { showError, showLoading, dismissToast, showSuccess } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { formatAmount, extractList } from '@/components/economic/EconomicDetailDialog';
import CountrySelector from '@/components/CountrySelector';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import DepositReturnForm from '@/components/deposits/DepositReturnForm';

// Types
type EconomicProxyResponse<T = any> = {
  ok?: boolean;
  status?: number;
  data?: T;
  request?: { url?: string };
  error?: string;
};

type EconomicLedgerEntry = {
  entryNumber: number;
  entryType: string;
  text: string;
  amount: number;
  currency: string;
  remainder: number;
  customer: {
    customerNumber: number;
    name: string;
    self: string;
    email?: string;
    address?: {
      street?: string;
      city?: string;
      postalCode?: string;
      country?: string;
    };
  };
  invoice: {
    bookedInvoiceNumber?: number;
    self?: string;
    invoiceNumber?: number;
  };
  self: string;
};

type EconomicCustomer = {
  customerNumber: number;
  name: string;
  self: string;
  email?: string;
};

// Helper to get nested values from an object
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

// New component to handle each customer's accordion item and balance fetching
const CustomerAccordionItem = ({ customerName, group, country, handleViewInvoice }: { customerName: string; group: { customer: EconomicCustomer & { address?: any }; entries: EconomicLedgerEntry[] }; country: string; handleViewInvoice: (entry: EconomicLedgerEntry) => void; }) => {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<EconomicLedgerEntry | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: balanceData, isLoading: isLoadingBalance } = useQuery<{ balance: number | null }>({
    queryKey: ['customerBalance', group.customer.customerNumber, country],
    queryFn: async () => {
      const customerNumber = group.customer.customerNumber;
      if (!customerNumber) return { balance: null };

      const getNumeric = (obj: any, keys: string[]): number | null => {
        const value = pick(obj, keys);
        if (value === null || value === undefined) return null;
        const num = parseFloat(String(value));
        return isNaN(num) ? null : num;
      };

      const { data: totalsData } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path: `/customers/${customerNumber}/totals`, method: "GET", country },
      });
      const totalsResp = totalsData as EconomicProxyResponse<any>;
      let balanceVal = getNumeric(totalsResp?.data, ["balance", "outstandingAmount"]);

      if (balanceVal === null) {
        const { data: customerData } = await supabase.functions.invoke("economic-api-proxy", {
          body: { path: `/customers/${customerNumber}`, method: "GET", country },
        });
        const customerResp = customerData as EconomicProxyResponse<any>;
        balanceVal = getNumeric(customerResp?.data, ["balance", "outstandingAmount"]);
      }

      return { balance: balanceVal };
    },
    enabled: !!group.customer.customerNumber,
    staleTime: 5 * 60 * 1000,
  });

  const hasOutstandingBalance = balanceData?.balance != null && balanceData.balance > 0;

  const handleRequestRepaymentClick = (entry: EconomicLedgerEntry) => {
    if (hasOutstandingBalance) {
      setShowErrorDialog(true);
    } else {
      setSelectedEntry(entry);
      setShowFormDialog(true);
    }
  };

  const handleCreateDepositReturnRequest = async (formValues: any) => {
    if (!selectedEntry || !user) return;
    setIsSubmitting(true);
    const toastId = showLoading("Creating deposit return request...");

    try {
      const customerAddress = [
        group.customer.address?.street,
        group.customer.address?.city,
        group.customer.address?.postalCode,
        group.customer.address?.country,
      ].filter(Boolean).join(', ');

      const { error } = await supabase.from('payment_requests').insert({
        requester_id: user.id,
        supplier_name: group.customer.name,
        supplier_address: customerAddress || 'Address not available in e-conomic',
        currency: selectedEntry.currency,
        total_amount: Math.abs(selectedEntry.remainder),
        reason_for_payment: `Deposit Return for Final Statement - Entry #${selectedEntry.entryNumber}`,
        date_payment_required: new Date().toISOString().split('T')[0],
        status: 'pending',
        country: country,
        is_deposit_return: true,
        not_sku_related: true,
        categories: [{ category: '974_other', amount: Math.abs(selectedEntry.remainder) }],
        invoice_pdf_urls: [],
        bank_details_verified: formValues.bank_details_verified,
        bank_account_name: formValues.bank_account_name,
        iban_number: formValues.iban_number,
        // UK fields are not applicable here as this is for Switzerland
        sort_code: null,
        account_number: null,
      });

      if (error) throw error;

      dismissToast(toastId);
      showSuccess("Deposit return request created successfully!");
      setShowFormDialog(false);
      setSelectedEntry(null);
      queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] });
      queryClient.invalidateQueries({ queryKey: ['allPaymentRequestsForSummary'] });
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to create request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <AccordionItem value={customerName}>
        <AccordionTrigger className="text-lg font-semibold">
          <span className="flex items-center gap-4">
            {customerName} ({group.entries.length} entries)
            {isLoadingBalance ? (
              <Badge variant="outline">Checking balance...</Badge>
            ) : hasOutstandingBalance && (
              <Badge variant="destructive">Outstanding Balance</Badge>
            )}
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entry Text</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead className="text-right">Amount Outstanding</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.entries.map(entry => (
                <TableRow key={entry.entryNumber}>
                  <TableCell>{entry.text}</TableCell>
                  <TableCell className="text-right">{formatAmount(entry.amount)} {entry.currency}</TableCell>
                  <TableCell className="text-right font-semibold text-red-600">{formatAmount(entry.remainder)} {entry.currency}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      {entry.entryType !== 'customerPayment' && (
                        <Button variant="outline" size="sm" onClick={() => handleViewInvoice(entry)}>
                          <FileText className="mr-2 h-4 w-4" /> View Invoice
                        </Button>
                      )}
                      <Button variant="destructive" size="sm" onClick={() => handleRequestRepaymentClick(entry)}>
                        Request Repayment
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AccordionContent>
      </AccordionItem>

      {/* Error Dialog */}
      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-destructive">
              <AlertTriangle className="mr-2 h-6 w-6" />
              Outstanding Balance
            </DialogTitle>
            <DialogDescription className="pt-4 text-base">
              This customer has an outstanding balance. A deposit return cannot be made until the balance is cleared.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Form Dialog */}
      {selectedEntry && (
        <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Deposit Return</DialogTitle>
              <DialogDescription>
                Please provide the customer's bank details for the repayment.
              </DialogDescription>
            </DialogHeader>
            <DepositReturnForm
              customerName={customerName}
              returnAmount={Math.abs(selectedEntry.remainder)}
              currency={selectedEntry.currency}
              onSubmit={handleCreateDepositReturnRequest}
              isSubmitting={isSubmitting}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

const CustomerDepositReturns = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry, setCurrentCountry, isCountryLocked, availableCountries } = useCountry();
  const navigate = useNavigate();

  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [isFetching, setIsFetching] = useState(false);

  const isAdmin = userProfile?.role === "admin";

  const { data: customers, isLoading: isLoadingCustomers } = useQuery<EconomicCustomer[]>({
    queryKey: ['allEconomicCustomers', currentCountry],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path: "/customers?pagesize=1000", method: "GET", country: currentCountry },
      });
      if (error) throw new Error(error.message);
      const resp = data as EconomicProxyResponse<any>;
      return extractList(resp?.data) as EconomicCustomer[];
    },
    enabled: !!session && isAdmin,
  });

  const customerNameMap = useMemo(() => {
    if (!customers) return {};
    return customers.reduce((acc, customer) => {
      if (customer.customerNumber) {
        acc[customer.customerNumber] = customer.name;
      }
      return acc;
    }, {} as Record<number, string>);
  }, [customers]);

  const { data: entries, isLoading: isLoadingEntries, refetch } = useQuery<EconomicLedgerEntry[]>({
    queryKey: ['finalStatementEntries', selectedCustomer, currentCountry],
    queryFn: async () => {
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
        return [];
      }

      let allEntries: EconomicLedgerEntry[] = [];
      let filter = `text$like:*Final Statement*`;
      if (selectedCustomer !== 'all') {
        filter += `$and:customer.customerNumber$eq:${selectedCustomer}`;
      }

      const yearPromises = accountingYears.map(yearInfo => {
        const year = yearInfo.year;
        const path = `/accounting-years/${year}/entries?pagesize=1000&filter=${filter}`;
        return supabase.functions.invoke("economic-api-proxy", {
          body: { path, method: "GET", country: currentCountry },
        });
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
        } else {
          console.warn(`Non-OK response fetching entries for a year: Status ${resp.status}`);
        }
      }

      return allEntries as EconomicLedgerEntry[];
    },
    enabled: false,
  });

  const handleFetchReport = () => {
    setIsFetching(true);
    const toastId = showLoading("Fetching final statement entries...");
    refetch().then(() => {
      dismissToast(toastId);
      showSuccess("Report generated successfully.");
    }).catch((e) => {
      dismissToast(toastId);
      showError(e.message || "Failed to fetch report.");
    }).finally(() => {
      setIsFetching(false);
    });
  };

  const groupedEntries = useMemo(() => {
    if (!entries) return {};
    return entries.reduce((acc, entry) => {
      const customerNumber = entry.customer?.customerNumber;
      const customerName = customerNumber ? (customerNameMap[customerNumber] || `Customer #${customerNumber}`) : 'Unknown Customer';
      
      if (!acc[customerName]) {
        acc[customerName] = {
          customer: entry.customer,
          entries: [],
        };
      }
      acc[customerName].entries.push(entry);
      return acc;
    }, {} as Record<string, { customer: EconomicCustomer & { address?: any }; entries: EconomicLedgerEntry[] }>);
  }, [entries, customerNameMap]);

  const pathFromSelf = (self: string): string | undefined => {
    if (typeof self !== "string" || !self) return undefined;
    if (self.startsWith("http")) {
      const parts = self.split("/");
      return "/" + parts.slice(3).join("/");
    }
    return self.startsWith("/") ? self : "/" + self;
  };

  const handleViewInvoice = useCallback(async (entry: EconomicLedgerEntry) => {
    try {
      const invoiceObject = entry.invoice || entry;
      const bookedInvoiceNumber = (invoiceObject as any).bookedInvoiceNumber || (invoiceObject as any).invoice?.bookedInvoiceNumber || (invoiceObject as any).invoiceNumber;
      let basePath: string | undefined;

      if (bookedInvoiceNumber) {
        basePath = `/invoices/booked/${bookedInvoiceNumber}`;
      } else {
        const selfLink = (invoiceObject as any).self || (invoiceObject as any).invoice?.self;
        basePath = pathFromSelf(selfLink);
      }

      if (!basePath) {
        throw new Error("Could not determine a valid invoice path for this entry. No booked invoice number or self link found.");
      }

      const pdfPath = `${basePath}/pdf`;
      const proxyUrl = `https://vcpvwcfuvpngmxenhixj.supabase.co/functions/v1/economic-pdf-proxy?path=${encodeURIComponent(pdfPath)}&country=${encodeURIComponent(currentCountry)}`;

      window.open(proxyUrl, '_blank');
    } catch (e: any) {
      showError(e.message);
    }
  }, [currentCountry]);

  if (isSessionLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (!isAdmin) {
    showError("You do not have permission to view this page.");
    navigate('/dashboard');
    return null;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Customer Deposit Returns - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <Home className="mr-2 h-6 w-6" /> Customer Deposit Returns
          </CardTitle>
          <CardDescription>
            Generate a report of all customer entries marked as 'Final Statement' from e-conomic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4 p-4 border rounded-md bg-gray-50 shadow-sm">
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="country-filter" className="block text-sm font-medium text-gray-700 mb-1">Filter by Country</label>
                <CountrySelector
                  value={currentCountry}
                  onValueChange={setCurrentCountry}
                  disabled={isCountryLocked && !isAdmin}
                  availableCountries={isAdmin ? availableCountries : availableCountries.filter(c => c.value === userProfile?.country)}
                />
              </div>
              <div className="flex-1 min-w-[250px]">
                <label htmlFor="customer-filter" className="block text-sm font-medium text-gray-700 mb-1">Filter by Customer</label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer} disabled={isLoadingCustomers}>
                  <SelectTrigger id="customer-filter">
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers?.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => (
                      <SelectItem key={c.customerNumber} value={String(c.customerNumber)}>
                        {c.name} (#{c.customerNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleFetchReport}
                disabled={isFetching || isLoadingEntries}
                className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm"
              >
                <Search className="mr-2 h-4 w-4" />
                {isFetching ? "Generating..." : "Generate Report"}
              </Button>
            </div>

            {isLoadingEntries && <p className="text-center text-muted-foreground">Loading report data...</p>}
            
            {entries && Object.keys(groupedEntries).length > 0 && (
              <Accordion type="multiple" className="w-full">
                {Object.entries(groupedEntries).sort(([nameA], [nameB]) => nameA.localeCompare(nameB)).map(([customerName, group]) => (
                  <CustomerAccordionItem
                    key={customerName}
                    customerName={customerName}
                    group={group}
                    country={currentCountry}
                    handleViewInvoice={handleViewInvoice}
                  />
                ))}
              </Accordion>
            )}

            {entries && Object.keys(groupedEntries).length === 0 && !isLoadingEntries && (
              <p className="text-center text-muted-foreground mt-8">
                No 'Final Statement' entries found for the selected customer.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerDepositReturns;