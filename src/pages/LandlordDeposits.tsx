"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { PaymentRequest, DepositReturnAdvise } from '@/types/supabase';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Home, FileText, Search, Filter, RotateCw, AlertTriangle, Clock, ArrowUp, ArrowDown, Database } from 'lucide-react';
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
import AdviseDepositReturnForm from '@/components/deposits/AdviseDepositReturnForm';

// Define the Landlord Deposit Account Number
const LANDLORD_DEPOSIT_ACCOUNT_NUMBER = 5201;

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
  departmentalDistribution?: {
    departmentalDistributionNumber?: number;
    self?: string;
  };
  departmentNumber?: number;
  self: string;
  [key: string]: any;
};

// Helper to get nested values from an object without incorrect type conversion
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
      if (typeof current === "string" && !isNaN(parseFloat(current))) {
        return parseFloat(current);
      }
      return current;
    }
  }
  return undefined;
};

const LandlordDeposits = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry, setCurrentCountry, isCountryLocked, availableCountries } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [departmentSearchTerm, setDepartmentSearchTerm] = useState('');
  const [debouncedFilterTerm, setDebouncedFilterTerm] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [dialogData, setDialogData] = useState<EconomicLedgerEntry[] | null>(null);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogDescription, setDialogDescription] = useState('');
  const [entryNumberSearch, setEntryNumberSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' }>({ key: 'date', direction: 'descending' });
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [showTransactionsTable, setShowTransactionsTable] = useState(false);
  const [isAdviseDialogOpen, setIsAdviseDialogOpen] = useState(false);
  const [showRawDataDialog, setShowRawDataDialog] = useState(false);
  const [refreshResult, setRefreshResult] = useState<any>(null);
  const [isRefreshResultDialogOpen, setIsRefreshResultDialogOpen] = useState(false);

  const { data: departments, isLoading: isLoadingDepartments } = useDepartments(currentCountry);

  const departmentMap = useMemo(() => {
    if (!departments) return new Map<number, string>();
    return new Map(departments.map(d => [d.departmentNumber, d.name]));
  }, [departments]);

  const getDepartmentName = (deptNumber: number | null | undefined): string => {
    if (deptNumber == null) return 'N/A';
    return departmentMap.get(deptNumber) || `Dept #${deptNumber} (Name Not Found)`;
  };

  const propertyNameForFilter = useMemo(() => {
    if (!debouncedFilterTerm || !departmentMap) return '';
    const numericSku = parseInt(debouncedFilterTerm, 10);
    if (isNaN(numericSku)) return '';
    return departmentMap.get(numericSku);
  }, [debouncedFilterTerm, departmentMap]);

  const { data: cacheData, isLoading: isLoadingEntries, refetch } = useQuery<{ entries: EconomicLedgerEntry[], cached_at: string } | null>({
    queryKey: ['landlordDepositCache', currentCountry],
    queryFn: async () => {
        if (!session || currentCountry === 'all') return null;
        const { data, error } = await supabase
            .from('landlord_deposit_cache')
            .select('entries, cached_at')
            .eq('country', currentCountry)
            .limit(1)
            .single();
        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            throw error;
        }
        return data;
    },
    enabled: !!session && currentCountry !== 'all',
  });

  const allAccountEntries = cacheData?.entries;
  const lastCachedAt = cacheData?.cached_at;

  const refreshCacheMutation = useMutation({
      mutationFn: async () => {
          const { data, error } = await supabase.functions.invoke('fetch-deposit-cache', {
              body: { country: currentCountry },
          });
          if (error) throw error;
          return data;
      },
      onSuccess: (data) => {
          setRefreshResult(data);
          setIsRefreshResultDialogOpen(true);
          if (data?.error) {
              showError(data.error);
          } else {
              showSuccess("Cache refresh initiated. Data will update shortly.");
          }
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['landlordDepositCache', currentCountry] });
          }, 5000);
      },
      onError: (error: any) => {
          setRefreshResult({ error: error.message });
          setIsRefreshResultDialogOpen(true);
          showError(error.message || "Failed to start cache refresh.");
      }
  });

  const displayedEntries = useMemo(() => {
    if (!allAccountEntries) return [];
    let entries = [...allAccountEntries];

    if (debouncedFilterTerm) {
      const numericTerm = parseInt(debouncedFilterTerm, 10);
      if (!isNaN(numericTerm)) {
        entries = entries.filter(entry => {
          let deptNum: number | string | null = null;

          if (entry?.departmentalDistribution?.departmentalDistributionNumber) {
            deptNum = entry.departmentalDistribution.departmentalDistributionNumber;
          } else if (entry?.department?.departmentNumber) {
            deptNum = entry.department.departmentNumber;
          } else if (entry?.departmentNumber) {
            deptNum = entry.departmentNumber;
          } else if (entry?.departmentalDistribution?.self) {
            const selfUrl = entry.departmentalDistribution.self;
            const match = selfUrl.match(/\/(\d+)$/);
            if (match && match[1]) {
              deptNum = parseInt(match[1], 10);
            }
          }
          
          return deptNum !== null && String(deptNum) === String(numericTerm);
        });
      }
    }

    entries.sort((a, b) => {
        const aValue = pick(a, [sortConfig.key]);
        const bValue = pick(b, [sortConfig.key]);

        if (aValue == null) return 1;
        if (bValue == null) return -1;

        if (sortConfig.key === 'date') {
            const dateA = aValue && typeof aValue === 'string' ? parseISO(aValue).getTime() : 0;
            const dateB = bValue && typeof bValue === 'string' ? parseISO(bValue).getTime() : 0;
            if (isNaN(dateA) || isNaN(dateB)) return 0;
            return sortConfig.direction === 'ascending' ? dateA - dateB : dateB - dateA;
        }

        if (typeof aValue === 'number' && typeof bValue === 'number') {
            return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
        }

        const stringA = String(aValue).toLowerCase();
        const stringB = String(bValue).toLowerCase();
        
        if (stringA < stringB) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (stringA > stringB) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
    });

    return entries;
  }, [allAccountEntries, debouncedFilterTerm, sortConfig]);

  const totalDepositBalance = useMemo(() => {
    if (!displayedEntries || displayedEntries.length === 0) return 0;
    return displayedEntries.reduce((sum, entry) => {
      const amountValue = parseFloat(String(entry.amount)) || 0;
      return sum + amountValue;
    }, 0);
  }, [displayedEntries]);

  const depositCurrency = useMemo(() => {
    if (!displayedEntries || displayedEntries.length === 0) return '';
    // Assuming all entries for a SKU have the same currency
    return displayedEntries[0].currency || '';
  }, [displayedEntries]);

  const handleSearch = () => {
    setSearchPerformed(true);
    setShowTransactionsTable(false); // Hide table on new search
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
  
  const handleDirectEntrySearch = async () => {
    const entryNum = entryNumberSearch.trim();
    if (!entryNum || !/^\d+$/.test(entryNum)) {
        showError("Please enter a valid numeric entry number.");
        return;
    }

    const toastId = showLoading(`Searching for entry #${entryNum}...`);
    try {
        const path = `/accounts/${LANDLORD_DEPOSIT_ACCOUNT_NUMBER}/entries/${entryNum}`;
        
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

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'descending' ? 'ascending' : 'descending',
    }));
  };

  const renderSortIcon = (key: string) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'ascending' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
    }
    return null;
  };

  const adviseDepositReturnMutation = useMutation({
    mutationFn: async (values: Omit<DepositReturnAdvise, 'id' | 'created_at' | 'advised_by' | 'status'> & { advised_by: string }) => {
        const { error } = await supabase.from('deposit_return_advise').insert(values);
        if (error) throw error;
        return true;
    },
    onSuccess: () => {
        showSuccess("Deposit return advice submitted successfully!");
        setIsAdviseDialogOpen(false);
    },
    onError: (error: any) => {
        showError(error.message || "Failed to submit advice.");
    },
  });

  const handleAdviseSubmit = async (values: any) => {
    if (!userProfile) {
        showError("User profile not found.");
        return;
    }
    await adviseDepositReturnMutation.mutateAsync({
        advised_by: userProfile.id,
        country: values.country,
        sku: values.sku,
        total_deposit: values.total_deposit,
        currency: values.currency,
        deductions: values.deductions,
        expected_refund: values.expected_refund,
        notes: values.notes,
    });
  };

  const ledgerColumns: DialogColumn[] = [
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'entryDate'] },
    { key: 'entryNumber', header: 'Entry No.', path: ['entryNumber', 'number', 'id'] },
    { key: 'entryType', header: 'Entry Type', path: ['entryType', 'type'] },
    { key: 'text', header: 'Text', path: ['text', 'description'] },
    { 
      key: 'department', 
      header: 'Property Address', 
      render: (item) => getDepartmentName(pick(item, ['departmentalDistribution.departmentalDistributionNumber', 'departmentalDistributionNumber', 'department.departmentNumber', 'departmentNumber', 'department.number', 'department'])) 
    },
    { key: 'account', header: 'Account', path: ['account.accountNumber'] },
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
            <Home className="mr-2 h-6 w-6" /> Landlord Deposits
          </CardTitle>
          <CardDescription>
            View all landlord deposit entries from e-conomic, filterable by property SKU.
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
                disabled={isLoadingEntries || currentCountry === 'all'}
                className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm"
              >
                <Search className="mr-2 h-4 w-4" />
                {isLoadingEntries ? "Searching..." : "Search Entries"}
              </Button>
              {debouncedFilterTerm.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => { setDepartmentSearchTerm(''); setDebouncedFilterTerm(''); setSearchPerformed(false); setShowTransactionsTable(false); }}
                  className="flex items-center gap-1"
                >
                  <RotateCw className="h-4 w-4" /> Clear Search
                </Button>
              )}
            </div>
            
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
                    disabled={isLoadingEntries || entryNumberSearch.trim().length === 0 || currentCountry === 'all'}
                    variant="secondary"
                    className="shadow-sm"
                >
                    <Search className="mr-2 h-4 w-4" />
                    Lookup Entry
                </Button>
            </div>

            {currentCountry === 'all' && userProfile?.role === 'admin' ? (
              <Alert>
                <AlertTitle>Please Select a Country</AlertTitle>
                <AlertDescription>To view landlord deposits, please select a specific country from the dropdown above.</AlertDescription>
              </Alert>
            ) : (
              <>
                {searchPerformed && debouncedFilterTerm && (
                  <Card className="bg-blue-50 border-blue-200">
                    <CardHeader>
                      <CardTitle className="flex items-center text-blue-800">
                        Total Deposit Balance for SKU: {debouncedFilterTerm}
                        {propertyNameForFilter && <span className="font-bold ml-2">- {propertyNameForFilter}</span>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-3xl font-bold text-blue-900">{formatAmount(totalDepositBalance)} {depositCurrency}</p>
                      <p className="text-sm text-blue-700">A Positive Balance Indicates a Deposit Held. by The Landlord</p>
                      <Button onClick={() => setIsAdviseDialogOpen(true)} className="w-full mt-4">
                        Advise of Deposit Return
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {searchPerformed && debouncedFilterTerm && !showTransactionsTable && (
                  <div className="text-center mt-4">
                    <Button onClick={() => setShowTransactionsTable(true)}>
                      View Deposit Transactions
                    </Button>
                  </div>
                )}

                {isLoadingEntries ? (
                  <div className="space-y-2">
                    {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : !searchPerformed ? (
                  <p className="text-center text-muted-foreground mt-8">
                    Please enter a property identifier (SKU) to begin.
                  </p>
                ) : showTransactionsTable ? (
                  displayedEntries.length > 0 ? (
                    <>
                      <div className="flex items-center gap-4">
                        <label htmlFor="sort-by" className="text-sm font-medium">Sort by:</label>
                        <Select
                          value={sortConfig.key}
                          onValueChange={(value) => handleSort(value)}
                        >
                          <SelectTrigger id="sort-by" className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="entryNumber">Entry Number</SelectItem>
                            <SelectItem value="amount">Amount</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="icon" onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'ascending' ? 'descending' : 'ascending' }))}>
                          {sortConfig.direction === 'ascending' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="cursor-pointer" onClick={() => handleSort('date')}>Date {renderSortIcon('date')}</TableHead>
                              <TableHead className="cursor-pointer" onClick={() => handleSort('entryNumber')}>Entry No. {renderSortIcon('entryNumber')}</TableHead>
                              <TableHead>Text</TableHead>
                              <TableHead className="cursor-pointer" onClick={() => handleSort('departmentalDistribution.departmentalDistributionNumber')}>Property (SKU) {renderSortIcon('departmentalDistribution.departmentalDistributionNumber')}</TableHead>
                              <TableHead className="text-right cursor-pointer" onClick={() => handleSort('amount')}>Amount {renderSortIcon('amount')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {displayedEntries.map((entry, index) => (
                              <TableRow key={entry.self || index}>
                                <TableCell>{entry.date && typeof entry.date === 'string' ? format(parseISO(entry.date), 'PPP') : 'Invalid Date'}</TableCell>
                                <TableCell>{entry.entryNumber}</TableCell>
                                <TableCell>{entry.text}</TableCell>
                                <TableCell>{getDepartmentName(pick(entry, ['departmentalDistribution.departmentalDistributionNumber', 'departmentalDistributionNumber', 'department.departmentNumber', 'departmentNumber', 'department.number', 'department']))}</TableCell>
                                <TableCell className="text-right">{formatAmount(entry.amount)} {entry.currency}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  ) : (
                    <p className="text-center text-muted-foreground mt-8">
                      No entries found matching SKU "{debouncedFilterTerm}" in account {LANDLORD_DEPOSIT_ACCOUNT_NUMBER}.
                    </p>
                  )
                ) : null}
              </>
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

      <Dialog open={isAdviseDialogOpen} onOpenChange={setIsAdviseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advise Deposit Return</DialogTitle>
            <DialogDescription>
              Advise an administrator that a deposit should be returned for property SKU {debouncedFilterTerm}.
            </DialogDescription>
          </DialogHeader>
          <AdviseDepositReturnForm
            sku={debouncedFilterTerm}
            country={currentCountry}
            totalDeposit={totalDepositBalance}
            currency={depositCurrency}
            onSubmit={handleAdviseSubmit}
            isSubmitting={adviseDepositReturnMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showRawDataDialog} onOpenChange={setShowRawDataDialog}>
        <DialogContent className="sm:max-w-[80%] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Raw Cache Data for {currentCountry}</DialogTitle>
            <DialogDescription>
              This is the raw JSON data fetched from the cache table. Last updated: {lastCachedAt ? format(new Date(lastCachedAt), 'PPP p') : 'N/A'}.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh] bg-gray-100 p-4 rounded">
            <pre className="text-xs whitespace-pre-wrap">
              {JSON.stringify(allAccountEntries, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isRefreshResultDialogOpen} onOpenChange={setIsRefreshResultDialogOpen}>
        <DialogContent className="sm:max-w-[80%] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Cache Refresh Result</DialogTitle>
            <DialogDescription>
              This is the raw response from the cache refresh process.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh] bg-gray-100 p-4 rounded">
            <pre className="text-xs whitespace-pre-wrap">
              {JSON.stringify(refreshResult, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LandlordDeposits;