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

type DepositCache = {
  country: string;
  cached_at: string;
  entries: EconomicLedgerEntry[];
};

type GroupedDepositEntry = {
  departmentNumber: number;
  departmentName: string;
  totalBalance: number; // Sum of remainder
  currency: string; // Assuming one currency per department/country
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
const DepartmentAccordionItem = ({ departmentName, group, country, handleViewDetails }: { departmentName: string; group: GroupedDepositEntry; country: string; handleViewDetails: (entries: EconomicLedgerEntry[], title: string, description: string) => void; }) => {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasCreditBalance = group.totalBalance < 0;
  const hasDebitBalance = group.totalBalance > 0;

  const handleRequestRepaymentClick = () => {
    if (group.totalBalance >= 0) {
      showError("Cannot request repayment: The property does not have a credit balance.");
    } else {
      setShowFormDialog(true);
    }
  };

  const handleCreateDepositReturnRequest = async (formValues: any) => {
    if (!user || group.totalBalance >= 0) return;
    setIsSubmitting(true);
    const toastId = showLoading("Creating deposit return request...");

    try {
      // Note: We don't have customer details here, so we use department info for supplier name/address
      const supplierName = `${departmentName} (SKU: ${group.departmentNumber})`;
      const supplierAddress = 'Address derived from e-conomic department name.';

      const { error } = await supabase.from('payment_requests').insert({
        requester_id: user.id,
        supplier_name: supplierName,
        sku_number: `CH${group.departmentNumber}`, // Assuming CH prefix for SKU creation
        not_sku_related: false,
        supplier_address: supplierAddress,
        currency: group.currency,
        total_amount: Math.abs(group.totalBalance),
        reason_for_payment: `Landlord Deposit Return for Property SKU: ${group.departmentNumber}`,
        date_payment_required: new Date().toISOString().split('T')[0],
        status: 'pending',
        country: country,
        is_deposit_return: false, // This is a Landlord Deposit, not Customer Deposit Return
        receipt_required: false,
        categories: [{ category: '5201_provider_deposit', amount: Math.abs(group.totalBalance) }],
        invoice_pdf_urls: [],
        bank_details_verified: formValues.bank_details_verified,
        bank_account_name: formValues.bank_account_name,
        iban_number: formValues.iban_number,
        sort_code: country === 'United Kingdom' ? formValues.sort_code : null,
        account_number: country === 'United Kingdom' ? formValues.account_number : null,
      });

      if (error) throw error;

      dismissToast(toastId);
      showSuccess("Landlord deposit return request created successfully!");
      setShowFormDialog(false);
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
      <AccordionItem value={departmentName}>
        <AccordionTrigger className="text-lg font-semibold">
          <span className="flex items-center gap-4">
            <Home className="h-5 w-5 text-dyad-blue" />
            {departmentName} (SKU: {group.departmentNumber})
            <Badge className={cn(
              "text-base px-3 py-1 whitespace-nowrap",
              hasCreditBalance ? "bg-green-600 text-white" : hasDebitBalance ? "bg-red-600 text-white" : "bg-gray-500 text-white"
            )}>
              {formatAmount(group.totalBalance)} {group.currency}
            </Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Entry No.</TableHead>
                <TableHead>Entry Type</TableHead>
                <TableHead>Text</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.entries.map(entry => (
                <TableRow key={entry.entryNumber} className={cn(entry.remainder < 0 ? 'bg-green-50/50' : entry.remainder > 0 ? 'bg-red-50/50' : '')}>
                  <TableCell>{format(parseISO(entry.date), 'PPP')}</TableCell>
                  <TableCell>{entry.entryNumber}</TableCell>
                  <TableCell>{entry.entryType}</TableCell>
                  <TableCell>{entry.text}</TableCell>
                  <TableCell className="text-right">{formatAmount(entry.amount)} {entry.currency}</TableCell>
                  <TableCell className={cn("text-right font-semibold", entry.remainder < 0 ? 'text-green-600' : entry.remainder > 0 ? 'text-red-600' : 'text-gray-600')}>
                    {formatAmount(entry.remainder)} {entry.currency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => handleViewDetails(group.entries, `All Entries for SKU: ${group.departmentNumber}`, `Showing all ledger entries for account ${LANDLORD_DEPOSIT_ACCOUNT_NUMBER} and department ${group.departmentNumber}.`)}>
              <FileText className="mr-2 h-4 w-4" /> View All Details
            </Button>
            {hasCreditBalance && (
              <Button variant="destructive" size="sm" onClick={handleRequestRepaymentClick}>
                Request Repayment ({formatAmount(Math.abs(group.totalBalance))} {group.currency})
              </Button>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Form Dialog for Landlord Deposit Return */}
      {hasCreditBalance && (
        <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Landlord Deposit Repayment</DialogTitle>
              <DialogDescription>
                Create a payment request to return the credit balance to the landlord for property {departmentName} (SKU: {group.departmentNumber}).
              </DialogDescription>
            </DialogHeader>
            <DepositReturnForm
              customerName={departmentName}
              returnAmount={Math.abs(group.totalBalance)}
              currency={group.currency}
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
  const queryClient = useQueryClient();

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
      
      // CRITICAL: Check for error payload returned by the Edge Function
      if (data?.error) {
        throw new Error(data.error);
      }

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

  // --- MAIN DATA SOURCE (Cache) ---
  const allAccountEntries = useMemo(() => {
    return cacheData?.entries || [];
  }, [cacheData]);

  // Effect to trigger cache refresh if stale or empty
  React.useEffect(() => {
    if (session && !isLoadingCache && (isCacheStale || !cacheData)) {
      console.log(`[LandlordDeposits] Cache is stale or empty. Triggering refresh for ${currentCountry}.`);
      refreshCacheMutation();
    }
  }, [session, isLoadingCache, isCacheStale, cacheData, currentCountry, refreshCacheMutation]);

  // --- Grouping and Balance Calculation ---
  const groupedEntries = useMemo(() => {
    const groups: Record<number, GroupedDepositEntry> = {};

    allAccountEntries.forEach(entry => {
      const deptNum = entry.department?.departmentNumber;
      const currency = entry.currency || 'N/A';
      
      if (deptNum && entry.account?.accountNumber === LANDLORD_DEPOSIT_ACCOUNT_NUMBER) {
        if (!groups[deptNum]) {
          groups[deptNum] = {
            departmentNumber: deptNum,
            departmentName: getDepartmentName(deptNum),
            totalBalance: 0,
            currency: currency,
            entries: [],
          };
        }
        
        // Sum the remainder to get the current balance
        groups[deptNum].totalBalance += entry.remainder;
        groups[deptNum].entries.push(entry);
      }
    });

    // Sort entries within each group by date
    Object.values(groups).forEach(group => {
      group.entries.sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
    });

    // Convert to array and sort by department name
    return Object.values(groups).sort((a, b) => a.departmentName.localeCompare(b.departmentName));
  }, [allAccountEntries, departmentMap]);

  // --- FILTERING LOGIC ---
  const resultsToDisplay = useMemo(() => {
    if (!debouncedFilterTerm) {
      return groupedEntries; // If no filter, show all grouped entries
    }
    const numericTerm = parseInt(debouncedFilterTerm, 10);
    if (isNaN(numericTerm)) {
      return []; // Should not happen due to validation in handleSearch
    }
    return groupedEntries.filter(group => group.departmentNumber === numericTerm);
  }, [groupedEntries, debouncedFilterTerm]);

  const isLoadingEntries = isLoadingCache || isFetching; // Combined loading state

  const handleSearch = () => {
    const term = departmentSearchTerm.trim();
    if (term.length > 0) {
        const numericTerm = term.replace(/^(CH|UK)/i, '');
        if (/^\d+$/.test(numericTerm)) {
            setDebouncedFilterTerm(numericTerm);
        } else {
            showError("Please enter a valid numeric property identifier (SKU). Prefixes like CH/UK are automatically removed.");
            setDebouncedFilterTerm('');
        }
    } else {
        setDebouncedFilterTerm('');
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

  const handleViewDetails = (entries: EconomicLedgerEntry[], title: string, description: string) => {
    if (entries.length === 0) return;
    setDialogData(entries);
    setDialogTitle(title);
    setDialogDescription(description);
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
            View the current balance of all landlord deposits (Account {LANDLORD_DEPOSIT_ACCOUNT_NUMBER}), grouped by property SKU.
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
                  onClick={() => { setDepartmentSearchTerm(''); setDebouncedFilterTerm(''); }}
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

            {/* Display Grouped Results */}
            {isLoadingEntries && <p className="text-center text-muted-foreground">Loading deposit entries...</p>}
            
            {!isLoadingEntries && resultsToDisplay.length > 0 ? (
              <Accordion type="multiple" className="w-full">
                {resultsToDisplay.map((group) => (
                  <DepartmentAccordionItem
                    key={group.departmentNumber}
                    departmentName={group.departmentName}
                    group={group}
                    country={currentCountry}
                    handleViewDetails={handleViewDetails}
                  />
                ))}
              </Accordion>
            ) : !isLoadingEntries && (
              <p className="text-center text-muted-foreground mt-8">
                {debouncedFilterTerm ? `No entries found matching SKU "${debouncedFilterTerm}" in account ${LANDLORD_DEPOSIT_ACCOUNT_NUMBER}.` : `No landlord deposit entries found for ${currentCountry}.`}
              </p>
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
        isLoading={false} 
        defaultSort={{ key: 'date', direction: 'descending' }} 
      />

      {/* NEW DEBUGGING CARD */}
      <Card className="mt-8 shadow-sm">
        <CardHeader>
          <CardTitle>Debug Panel</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-100 p-4 rounded-md text-xs overflow-auto max-h-96">
            {JSON.stringify({
              allAccountEntries_length: allAccountEntries.length,
              groupedEntries_length: groupedEntries.length,
              debouncedFilterTerm: debouncedFilterTerm,
              resultsToDisplay_length: resultsToDisplay.length,
              first_5_groups: groupedEntries.slice(0, 5).map(g => ({ departmentNumber: g.departmentNumber, departmentName: g.departmentName, totalBalance: g.totalBalance, entry_count: g.entries.length })),
            }, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
};

export default LandlordDeposits;