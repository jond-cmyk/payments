"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Home, Search, RotateCw, AlertTriangle, ArrowUp, ArrowDown, Database } from 'lucide-react';
import { showError, showLoading, dismissToast, showSuccess } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { formatAmount } from '@/components/economic/EconomicDetailDialog';
import { useDepartments } from '@/hooks/useDepartments';

import { Input } from '@/components/ui/input';
import CountrySelector from '@/components/CountrySelector';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type EconomicLedgerEntry = {
  entryNumber: number;
  entryType: string;
  text: string;
  amount: number;
  currency: string;
  date: string;
  departmentalDistribution?: {
    departmentalDistributionNumber?: number;
  };
  department?: {
    departmentNumber?: number;
  };
  departmentNumber?: number;
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
    if (found) return current;
  }
  return undefined;
};

const CustomerDeposits = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry, setCurrentCountry, isCountryLocked, availableCountries } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [departmentSearchTerm, setDepartmentSearchTerm] = useState('');
  const [debouncedFilterTerm, setDebouncedFilterTerm] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [showTransactionsTable, setShowTransactionsTable] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' }>({ key: 'date', direction: 'descending' });

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

  const { data: cachedData, isLoading: isLoadingCache, refetch: refetchCache } = useQuery<{ entries: EconomicLedgerEntry[], cached_at: string } | null>({
    queryKey: ['customerDepositCache', currentCountry],
    queryFn: async () => {
      if (!session || currentCountry === 'all') return null;
      const { data, error } = await supabase
        .from('customer_deposit_cache')
        .select('entries, cached_at')
        .eq('country', currentCountry)
        .single();
      if (error) {
        console.warn(`No cache found for ${currentCountry}, will attempt to fetch.`);
        return null;
      }
      return data;
    },
    enabled: !!session && currentCountry !== 'all',
  });

  const handleRefreshCache = async () => {
    const toastId = showLoading(`Refreshing customer deposit data for ${currentCountry}...`);
    setIsFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-customer-deposit-cache', {
        body: { country: currentCountry },
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      await queryClient.invalidateQueries({ queryKey: ['customerDepositCache', currentCountry] });
      dismissToast(toastId);
      showSuccess(data.message || "Cache refreshed successfully.");
    } catch (e: any) {
      dismissToast(toastId);
      showError(e.message || "Failed to refresh cache.");
    } finally {
      setIsFetching(false);
    }
  };

  const displayedEntries = useMemo(() => {
    if (!cachedData?.entries) return [];
    let entries = [...cachedData.entries];

    if (debouncedFilterTerm) {
      const numericTerm = parseInt(debouncedFilterTerm, 10);
      if (!isNaN(numericTerm)) {
        entries = entries.filter(entry => {
          const deptNum = pick(entry, ['departmentalDistribution.departmentalDistributionNumber', 'department.departmentNumber', 'departmentNumber']);
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
  }, [cachedData, debouncedFilterTerm, sortConfig]);

  const totalDepositBalance = useMemo(() => {
    if (!displayedEntries || displayedEntries.length === 0) return 0;
    return displayedEntries.reduce((sum, entry) => {
      const amountValue = parseFloat(String(entry.amount)) || 0;
      return sum + amountValue;
    }, 0);
  }, [displayedEntries]);

  const depositCurrency = useMemo(() => {
    if (!displayedEntries || displayedEntries.length === 0) return '';
    return displayedEntries[0].currency || '';
  }, [displayedEntries]);

  const handleSearch = () => {
    setSearchPerformed(true);
    setShowTransactionsTable(false);
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

  if (isSessionLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }

  if (!session) {
    navigate("/login");
    return null;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Customer Deposits - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <Home className="mr-2 h-6 w-6" /> Customer Deposits
          </CardTitle>
          <CardDescription>
            View customer deposit entries from e-conomic, filterable by property SKU.
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
                disabled={isLoadingCache || isLoadingDepartments || currentCountry === 'all'}
                className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm"
              >
                <Search className="mr-2 h-4 w-4" />
                {isLoadingCache ? "Searching..." : "Search Entries"}
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

            {userProfile?.role === 'admin' && currentCountry !== 'all' && (
              <Alert>
                <Database className="h-4 w-4" />
                <AlertTitle>Data Cache Information</AlertTitle>
                <AlertDescription className="flex items-center justify-between">
                  <span>
                    Data for {currentCountry} was last refreshed: {cachedData?.cached_at ? format(parseISO(cachedData.cached_at), 'PPP p') : 'Never'}.
                  </span>
                  <Button onClick={handleRefreshCache} disabled={isFetching} size="sm">
                    <RotateCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                    Refresh Now
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {currentCountry === 'all' && userProfile?.role === 'admin' ? (
              <Alert>
                <AlertTitle>Please Select a Country</AlertTitle>
                <AlertDescription>To view customer deposits, please select a specific country from the dropdown above.</AlertDescription>
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
                      <p className="text-sm text-blue-700">A Negative Balance Indicates a Deposit Held by KH from the Customer.</p>
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

                {isLoadingCache || isLoadingDepartments ? (
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
                              <TableHead>Customer</TableHead>
                              <TableHead className="text-right cursor-pointer" onClick={() => handleSort('amount')}>Amount {renderSortIcon('amount')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {displayedEntries.map((entry, index) => (
                              <TableRow key={entry.self || index}>
                                <TableCell>{entry.date && typeof entry.date === 'string' ? format(parseISO(entry.date), 'PPP') : 'Invalid Date'}</TableCell>
                                <TableCell>{entry.entryNumber}</TableCell>
                                <TableCell>{entry.text}</TableCell>
                                <TableCell>{entry.customer?.name || `Customer #${entry.customer?.customerNumber}`}</TableCell>
                                <TableCell className="text-right">{formatAmount(entry.amount)} {entry.currency}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  ) : (
                    <p className="text-center text-muted-foreground mt-8">
                      No entries found matching SKU "{debouncedFilterTerm}" in account 8201.
                    </p>
                  )
                ) : null}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerDeposits;