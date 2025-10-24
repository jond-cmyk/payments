"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Home, FileText, Search, Filter, RotateCcw } from 'lucide-react';
import { showError, showLoading, dismissToast, showSuccess } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { formatAmount, extractList } from '@/components/economic/EconomicDetailDialog';

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
  text: string;
  amount: number;
  currency: string;
  remainingAmount: number;
  customer: {
    customerNumber: number;
    name: string;
    self: string;
  };
  invoice: {
    bookedInvoiceNumber?: number;
    self?: string;
  };
  self: string;
};

type EconomicCustomer = {
  customerNumber: number;
  name: string;
  self: string;
};

const CustomerDepositReturns = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();

  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [isFetching, setIsFetching] = useState(false);

  const isAdmin = userProfile?.role === "admin";

  // Fetch all customers for the filter dropdown
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

  // Fetch ledger entries based on filter
  const { data: entries, isLoading: isLoadingEntries, refetch } = useQuery<EconomicLedgerEntry[]>({
    queryKey: ['finalStatementEntries', selectedCustomer, currentCountry],
    queryFn: async () => {
      let filter = `text$like:*Final Statement*`;
      if (selectedCustomer !== 'all') {
        filter += `&customer.customerNumber$eq:${selectedCustomer}`;
      }
      const path = `/customer-ledger-entries?pagesize=1000&filter=${filter}`;
      
      const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path, method: "GET", country: currentCountry },
      });

      if (error) throw new Error(error.message);
      const resp = data as EconomicProxyResponse<any>;
      if (resp.error || !resp.ok) {
        throw new Error(resp.error || `e-conomic API returned status ${resp.status}`);
      }
      return extractList(resp?.data) as EconomicLedgerEntry[];
    },
    enabled: false, // Only fetch when the button is clicked
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
      const customerName = entry.customer?.name || `Customer #${entry.customer?.customerNumber}`;
      if (!acc[customerName]) {
        acc[customerName] = {
          customer: entry.customer,
          entries: [],
        };
      }
      acc[customerName].entries.push(entry);
      return acc;
    }, {} as Record<string, { customer: EconomicCustomer; entries: EconomicLedgerEntry[] }>);
  }, [entries]);

  const handleViewInvoice = useCallback(async (entry: EconomicLedgerEntry) => {
    const toastId = showLoading("Fetching invoice PDF...");
    try {
      const invoiceNumber = entry.invoice?.bookedInvoiceNumber;
      if (!invoiceNumber) {
        throw new Error("No booked invoice number found for this entry.");
      }
      const path = `/invoices/booked/${invoiceNumber}/pdf`;
      const proxyUrl = `https://vcpvwcfuvpngmxenhixj.supabase.co/functions/v1/economic-pdf-proxy?path=${encodeURIComponent(path)}&country=${encodeURIComponent(currentCountry)}`;
      window.open(proxyUrl, '_blank');
      dismissToast(toastId);
    } catch (e: any) {
      dismissToast(toastId);
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
              <div className="flex-1 min-w-[250px]">
                <label htmlFor="customer-filter" className="block text-sm font-medium text-gray-700 mb-1">Filter by Customer</label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer} disabled={isLoadingCustomers}>
                  <SelectTrigger id="customer-filter">
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers?.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
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
                  <AccordionItem key={customerName} value={customerName}>
                    <AccordionTrigger className="text-lg font-semibold">
                      {customerName} ({group.entries.length} entries)
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
                              <TableCell className="text-right font-semibold text-red-600">{formatAmount(entry.remainingAmount)} {entry.currency}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="outline" size="sm" onClick={() => handleViewInvoice(entry)}>
                                  <FileText className="mr-2 h-4 w-4" /> View Invoice
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </AccordionContent>
                  </AccordionItem>
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