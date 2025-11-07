"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isWithinInterval, differenceInHours } from 'date-fns';
import { PaymentRequest } from '@/types/supabase';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Home, FileText, Search, Filter, RotateCw, AlertTriangle, Clock } from 'lucide-react';
import { showError, showLoading, dismissToast, showSuccess, showInfo } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import EconomicDetailDialog, { DialogColumn, extractList, formatAmount } from '@/components/economic/EconomicDetailDialog';
import { useDepartments } from '@/hooks/useDepartments';

import { Input } from '@/components/ui/input';
import CountrySelector from '@/components/CountrySelector';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import DepositReturnForm from '@/components/deposits/DepositReturnForm';

// Define the Landlord Deposit Account Number
const LANDLORD_DEPOSIT_ACCOUNT_NUMBER = 5201;
const CACHE_STALE_HOURS = 24;

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
  date: string;
  dueDate: string;
  account: {
    accountNumber: number;
    self: string;
  };
  department: {
    departmentNumber: number;
    self: string;
  };
  self: string;
  [key: string]: any;
};

type EconomicCustomer = {
  customerNumber: number;
  name: string;
  self: string;
  email?: string;
};

type DepositCache = {
  country: string;
  cached_at: string;
  entries: EconomicLedgerEntry[];
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
const CustomerAccordionItem = ({ customerName, group, country, handleViewInvoice, activeReturnRequestEntryNumbers }: { customerName: string; group: { customer: EconomicCustomer & { address?: any }; entries: EconomicLedgerEntry[] }; country: string; handleViewInvoice: (entry: EconomicLedgerEntry) => void; activeReturnRequestEntryNumbers: Set<number>; }) => {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<EconomicLedgerEntry | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNoRefundDialog, setShowNoRefundDialog] = useState(false);

  const { data: balanceData, isLoading: isLoadingBalance } = useQuery<{ balance: number | null }>({
    queryKey: ['customerBalance', group.customer?.customerNumber, country],
    queryFn: async () => {
      const customerNumber = group.customer?.customerNumber;
      if (!customerNumber) return { balance: null };

      const getNumeric = (obj: any, keys: string[]): number | null => {
        const value = pick(obj, keys);
        if (value === null || value === undefined) return null;
        const num = parseFloat(String(value));
        return isNaN(num) ? null : num;
      };

      // Attempt 1: Fetch from the /totals endpoint
      const { data: totalsData } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path: `/customers/${customerNumber}/totals`, method: "GET", country },
      });

      const totalsResp = totalsData as EconomicProxyResponse<any>;
      let balanceVal = getNumeric(totalsResp?.data, ["balance", "outstandingAmount"]);

      // Attempt 2 (Fallback): If values are missing, fetch from the base /customers/:num endpoint
      if (balanceVal === null) {
        const { data: customerData } = await supabase.functions.invoke("economic-api-proxy", {
          body: { path: `/customers/${customerNumber}`, method: "GET", country },
        });

        const customerResp = customerData as EconomicProxyResponse<any>;
        balanceVal = balanceVal ?? getNumeric(customerResp?.data, ["balance", "outstandingAmount"]);
      }

      return { balance: balanceVal };
    },
    enabled: !!group.customer?.customerNumber,
    staleTime: 5 * 60 * 1000,
  });

  const hasOutstandingBalance = balanceData?.balance != null && balanceData.balance > 0;

  const handleRequestRepaymentClick = (entry: EconomicLedgerEntry) => {
    if (entry.remainder >= 0) {
      setShowNoRefundDialog(true);
    } else if (hasOutstandingBalance) {
      setShowErrorDialog(true);
    } else {
      setSelectedEntry(entry);
      setShowFormDialog(true);
    }
  };

  const handleCreateDepositReturnRequest = async (formValues: any) => {
    if (!selectedEntry || !user || !group.customer?.customerNumber) return;
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
        supplier_name: customerName,
        supplier_address: customerAddress || 'Address not available in e-conomic',
        currency: selectedEntry.currency,
        total_amount: Math.abs(selectedEntry.remainder),
        reason_for_payment: `Deposit Return for Final Statement - Entry #${selectedEntry.entryNumber}`,
        date_payment_required: new Date().toISOString().split('T')[0],
        status: 'pending',
        country: country,
        is_deposit_return: true,
        not_sku_related: true,
        categories: [{ category: '8201_customer_deposit', amount: Math.abs(selectedEntry.remainder) }],
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
      queryClient.invalidateQueries({ queryKey: ['existingDepositReturns'] }); // Invalidate to update the button state
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
              {group.entries.map(entry => {
                const requestAlreadyExists = activeReturnRequestEntryNumbers.has(entry.entryNumber);
                return (
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
                        {requestAlreadyExists ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary">Request Pending</Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>A payment request for this deposit return already exists and is not declined.</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button variant="destructive" size="sm" onClick={() => handleRequestRepaymentClick(entry)}>
                            Request Repayment
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </AccordionContent>
      </AccordionItem>

      {/* Error Dialog for outstanding balance */}
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

      {/* New Error Dialog for no balance to refund */}
      <Dialog open={showNoRefundDialog} onOpenChange={setShowNoRefundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-destructive">
              <AlertTriangle className="mr-2 h-6 w-6" />
              No Balance to Refund
            </DialogTitle>
            <DialogDescription className="pt-4 text-base">
              There is no credit balance on this entry. A deposit return cannot be made.
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

const LandlordDeposits = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry, setCurrentCountry, isCountryLocked, availableCountries } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient(); // Use queryClient

  const [departmentSearchTerm, setDepartmentSearchTerm] = useState('');
  const [debouncedFilterTerm, setDebouncedFilterTerm] = useState(''); // State used to trigger the query (numeric SKU)
  const [isFetching, setIsFetching] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [dialogData, setDialogData] = useState<EconomicLedgerEntry[] | null>(null);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogDescription, setDialogDescription] = useState('');
  const [entryNumberSearch, setEntryNumberSearch] = useState(''); // NEW: State for direct entry search

  const { data: departments, isLoading: isLoadingDepartments } = useDepartments(currentCountry);

  const departmentMap = useMemo(() => {
    if (!departments) return new Map<number, string>();
    return new Map(departments.map(d => [d.departmentNumber, d.name]));
  }, [departments]);

  const getDepartmentName = (deptNumber: number | null | undefined): string => {
    if (!deptNumber) return 'N/A';
    return departmentMap.get(deptNumber) || `Dept #${deptNumber} (Name Not Found)`;
  };

  // --- CACHE CHECK QUERY ---
  const { data: cacheData, isLoading: isLoadingCache, refetch: refetchCache } = useQuery<DepositCache | null>({
    queryKey: ['landlordDepositCache', currentCountry],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('landlord_deposit_cache')
        .select('*')
        .eq('country', currentCountry)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
        console.error("Error fetching deposit cache:", error);
      }
      return data || null;
    },
    enabled: !!session,
    staleTime: 0, // Always check freshness manually
  });

  // --- CACHE REFRESH LOGIC ---
  const isCacheStale = useMemo(() => {
    if (!cacheData) return true;
    const cachedAt = parseISO(cacheData.cached_at);
    return differenceInHours(new Date(), cachedAt) >= CACHE_STALE_HOURS;
  }, [cacheData]);

  const refreshCacheMutation = useCallback(async () => {
    if (!session) return;
    
    const toastId = showLoading(`Refreshing deposit cache for ${currentCountry}...`);
    setIsFetching(true);
    
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('fetch-deposit-cache', {
        body: { country: currentCountry },
      });

      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(data.error);

      showSuccess(data?.message || `Cache refreshed successfully for ${currentCountry}.`);
      
      // Invalidate the cache query to force a refetch of the fresh data
      await queryClient.invalidateQueries({ queryKey: ['landlordDepositCache', currentCountry] });
      
    } catch (e: any) {
      showError(e.message || "Failed to refresh cache.");
      console.error("Cache refresh error:", e);
    } finally {
      dismissToast(toastId);
      setIsFetching(false);
    }
  }, [session, currentCountry, queryClient]);

  // --- MAIN DATA SOURCE (Cache or Refresh) ---
  const allAccountEntries = useMemo(() => {
    if (cacheData?.entries) {
      let results = cacheData.entries;
      
      // Apply client-side filter based on debouncedFilterTerm (SKU)
      if (debouncedFilterTerm) {
          const numericTerm = parseInt(debouncedFilterTerm, 10);
          results = results.filter(entry => 
              entry.department?.departmentNumber === numericTerm
          );
      }
      return results;
    }
    return [];
  }, [cacheData, debouncedFilterTerm]);

  // Effect to trigger cache refresh if stale or empty
  React.useEffect(() => {
    if (session && !isLoadingCache && (isCacheStale || !cacheData)) {
      console.log(`[LandlordDeposits] Cache is stale or empty. Triggering refresh for ${currentCountry}.`);
      refreshCacheMutation();
    }
  }, [session, isLoadingCache, isCacheStale, cacheData, currentCountry, refreshCacheMutation]);


  // The results are now directly in allAccountEntries
  const resultsToDisplay = allAccountEntries;
  const isLoadingEntries = isLoadingCache || isFetching; // Combined loading state

  const handleSearch = () => {
    const term = departmentSearchTerm.trim();
    if (term.length > 0) {
        // 1. Remove SKU prefix (CH/UK) if present
        const numericTerm = term.replace(/^(CH|UK)/i, '');
        
        // 2. Validate if the remaining part is purely numeric
        if (/^\d+$/.test(numericTerm)) {
            setDebouncedFilterTerm(numericTerm);
        } else {
            // If the input is not numeric after stripping prefix, show error and do not search
            showError("Please enter a valid numeric property identifier (SKU). Prefixes like CH/UK are automatically removed.");
            setDebouncedFilterTerm('');
            setDialogData(null);
            setShowDetailDialog(false);
        }
    } else {
        setDebouncedFilterTerm('');
        setDialogData(null);
        setShowDetailDialog(false);
    }
  };
  
  // NEW: Direct Entry Search Handler
  const handleDirectEntrySearch = async () => {
    const entryNum = entryNumberSearch.trim();
    if (!entryNum || !/^\d+$/.test(entryNum)) {
        showError("Please enter a valid numeric entry number.");
        return;
    }

    const toastId = showLoading(`Searching for entry #${entryNum}...`);
    try {
        // Use the most reliable path for a single entry associated with the account
        const path = `/account-ledger-entries/${LANDLORD_DEPOSIT_ACCOUNT_NUMBER}/${entryNum}`;
        
        const { data, error: invokeError } = await supabase.functions.invoke("economic-api-proxy", {
            body: { path, method: "GET", country: currentCountry },
        });
        
        if (invokeError) throw new Error(invokeError.message);
        const resp = data as EconomicProxyResponse<EconomicLedgerEntry>;

        if (resp.error || !resp.ok || !resp.data) {
            throw new Error(resp.error || `e-conomic API returned status ${resp.status}`);
        }
        
        const entry = resp.data as EconomicLedgerEntry;
        
        if (entry) {
            setDialogData([entry]);
            setDialogTitle(`Direct Entry #${entryNum}`);
            setDialogDescription(`Raw ledger entry details.`);
            setShowDetailDialog(true);
            showSuccess(`Entry #${entryNum} found.`);
        } else {
            showInfo(`Entry #${entryNum} not found.`);
        }

    } catch (e: any) {
        showError(e.message || "Failed to fetch entry directly.");
        console.error("Direct entry search error:", e);
    } finally {
        dismissToast(toastId);
    }
  };

  const handleViewDetails = (entries: EconomicLedgerEntry[]) => {
    if (entries.length === 0) return;
    setDialogData(entries);
    setDialogTitle(`Ledger Entries for SKU: ${debouncedFilterTerm}`);
    setDialogDescription(`Showing ${entries.length} transactions booked to Account ${LANDLORD_DEPOSIT_ACCOUNT_NUMBER} matching the search term.`);
    setShowDetailDialog(true);
  };

  const ledgerColumns: DialogColumn[] = [
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'entryDate'] },
    { key: 'entryNumber', header: 'Entry No.', path: ['entryNumber', 'number', 'id'] },
    { key: 'entryType', header: 'Entry Type', path: ['entryType', 'type'] },
    { key: 'text', header: 'Text', path: ['text', 'description'] },
    { 
      key: 'department', 
      header: 'Property Address', 
      render: (item) => getDepartmentName(item.department?.departmentNumber) 
    },
    { key: 'account', header: 'Account', path: ['account.accountNumber'] }, // Added Account column
    { key: 'amount', header: 'Amount', format: 'currencyAmount', path: ['amount', 'amount.value', 'totalAmount', 'grossAmount'] },
    { key: 'currency', header: 'Currency', path: ['currency', 'currency.code'] },
    { key: 'remainder', header: 'Outstanding', format: 'currencyAmount', path: ['remainder'] },
    { key: 'dueDate', header: 'Due Date', format: 'date', path: ['dueDate'] },
  ];

  if (isSessionLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }

  if (!session) {
    navigate("/login");
    return null;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Landlord Deposits - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <Home className="mr-2 h-6 w-6" /> Landlord Deposits (Account {LANDLORD_DEPOSIT_ACCOUNT_NUMBER})
          </CardTitle>
          <CardDescription>
            Search for all transactions booked to the Landlord Deposit account ({LANDLORD_DEPOSIT_ACCOUNT_NUMBER}) filtered by a specific property identifier (SKU).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4 p-4 border rounded-md bg-gray-50 shadow-sm">
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="country-filter" className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <CountrySelector
                  value={currentCountry}
                  onValueChange={setCurrentCountry}
                  disabled={isCountryLocked && userProfile?.role !== 'admin'}
                  availableCountries={availableCountries.filter(c => c.value !== 'all')}
                />
              </div>
              <div className="flex-1 min-w-[250px]">
                <label htmlFor="department-search" className="block text-sm font-medium text-gray-700 mb-1">Property Identifier / SKU (Numeric Only)</label>
                <Input
                  id="department-search"
                  placeholder="e.g., 12345 (CH12345)"
                  value={departmentSearchTerm}
                  onChange={(e) => setDepartmentSearchTerm(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  className="w-full"
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={isLoadingEntries || departmentSearchTerm.trim().length === 0}
                className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm"
              >
                <Search className="mr-2 h-4 w-4" />
                {isLoadingEntries ? "Searching..." : "Search Entries"}
              </Button>
              {debouncedFilterTerm.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => { setDepartmentSearchTerm(''); setDebouncedFilterTerm(''); setDialogData(null); setShowDetailDialog(false); }}
                  className="flex items-center gap-1"
                >
                  <RotateCw className="h-4 w-4" /> Clear Search
                </Button>
              )}
            </div>
            
            {/* NEW: Direct Entry Search Section */}
            <div className="flex flex-wrap items-end gap-4 p-4 border rounded-md bg-gray-50 shadow-sm">
                <div className="flex-1 min-w-[250px]">
                    <label htmlFor="entry-number-search" className="block text-sm font-medium text-gray-700 mb-1">Direct Entry Number Lookup</label>
                    <Input
                        id="entry-number-search"
                        placeholder="e.g., 503408"
                        value={entryNumberSearch}
                        onChange={(e) => setEntryNumberSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleDirectEntrySearch(); }}
                        className="w-full"
                    />
                </div>
                <Button
                    onClick={handleDirectEntrySearch}
                    disabled={isLoadingEntries || entryNumberSearch.trim().length === 0}
                    variant="secondary"
                    className="shadow-sm"
                >
                    <Search className="mr-2 h-4 w-4" />
                    Lookup Entry
                </Button>
            </div>

            {/* Display Cache Status */}
            <Alert variant={isCacheStale ? "destructive" : "default"} className="mt-4">
                <AlertTitle className="flex items-center">
                    {isCacheStale ? <AlertTriangle className="mr-2 h-4 w-4" /> : <Clock className="mr-2 h-4 w-4" />}
                    Deposit Ledger Cache Status
                </AlertTitle>
                <AlertDescription>
                    {cacheData ? (
                        <>
                            Data last fetched: {format(parseISO(cacheData.cached_at), 'PPP p')}. 
                            {isCacheStale ? (
                                <span className="font-bold text-red-700"> Cache is stale (older than {CACHE_STALE_HOURS} hours).</span>
                            ) : (
                                <span className="text-green-700"> Cache is fresh.</span>
                            )}
                            <Button 
                                variant="link" 
                                onClick={refreshCacheMutation} 
                                disabled={isFetching}
                                className="p-0 h-auto ml-2 text-sm"
                            >
                                {isFetching ? "Refreshing..." : "Force Refresh Now"}
                            </Button>
                        </>
                    ) : (
                        <span className="font-bold">Cache is empty. Fetching data now...</span>
                    )}
                </AlertDescription>
            </Alert>

            {/* Display Search Results Summary */}
            {debouncedFilterTerm.length > 0 && (
                <Card className="border-l-4 border-dyad-blue shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-semibold">
                            Results for SKU: {debouncedFilterTerm}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoadingEntries ? (
                            <Skeleton className="h-8 w-full" />
                        ) : resultsToDisplay && resultsToDisplay.length > 0 ? (
                            <div className="flex justify-between items-center">
                                <p className="text-2xl font-bold text-green-600">
                                    {resultsToDisplay.length} Entries Found
                                </p>
                                <Button onClick={() => handleViewDetails(resultsToDisplay)} variant="outline">
                                    <FileText className="mr-2 h-4 w-4" /> View Details
                                </Button>
                            </div>
                        ) : (
                            <p className="text-muted-foreground">
                                No entries found matching SKU "{debouncedFilterTerm}" in account {LANDLORD_DEPOSIT_ACCOUNT_NUMBER}.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
          </div>
        </CardContent>
      </Card>
      
      <EconomicDetailDialog 
        isOpen={showDetailDialog} 
        onOpenChange={setShowDetailDialog} 
        title={dialogTitle} 
        description={dialogDescription} 
        data={dialogData} 
        columns={ledgerColumns} 
        isLoading={isLoadingEntries} 
        defaultSort={{ key: 'date', direction: 'descending' }} 
      />
    </div>
  );
};

export default LandlordDeposits;