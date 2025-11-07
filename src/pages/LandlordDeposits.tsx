"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { Home, Search, AlertTriangle, FileText, RotateCw } from 'lucide-react';
import { showError, showLoading, dismissToast, showSuccess, showInfo } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import EconomicDetailDialog, { DialogColumn, extractList, formatAmount } from '@/components/economic/EconomicDetailDialog';
import { useDepartments } from '@/hooks/useDepartments';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import CountrySelector from '@/components/CountrySelector';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const LANDLORD_DEPOSIT_ACCOUNT_NUMBER = 5201;

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

const LandlordDeposits = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry, setCurrentCountry, isCountryLocked, availableCountries } = useCountry();
  const navigate = useNavigate();

  const [departmentSearchTerm, setDepartmentSearchTerm] = useState('');
  const [debouncedFilterTerm, setDebouncedFilterTerm] = useState(''); // State used to trigger the query (numeric SKU)
  const [isFetching, setIsFetching] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [dialogData, setDialogData] = useState<EconomicLedgerEntry[] | null>(null);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogDescription, setDialogDescription] = useState('');
  // Removed showDepartmentWarning state

  const { data: departments, isLoading: isLoadingDepartments } = useDepartments(currentCountry);

  const departmentMap = useMemo(() => {
    if (!departments) return new Map<number, string>();
    return new Map(departments.map(d => [d.departmentNumber, d.name]));
  }, [departments]);

  const getDepartmentName = (deptNumber: number | null | undefined): string => {
    if (!deptNumber) return 'N/A';
    return departmentMap.get(deptNumber) || `Dept #${deptNumber} (Name Not Found)`;
  };

  // Query to fetch ALL entries for the current accounting year (or all years)
  const { data: allAccountEntries, isLoading: isLoadingEntries, error: entriesError, refetch } = useQuery<EconomicLedgerEntry[]>({
    queryKey: ['landlordDepositEntries_All', currentCountry], // Query key is now independent of search term
    queryFn: async () => {
      
      const toastId = showLoading(`Fetching ALL entries for all years...`);
      setIsFetching(true);

      try {
        // 1. Fetch all accounting years
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
        
        const yearPromises = accountingYears.map(yearInfo => {
          const year = yearInfo.year;
          
          // 2. Fetch ALL entries for the year (no filter applied here)
          const path = `/accounting-years/${year}/entries?pagesize=1000`;
          
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
        
        // 3. Client-side filter by Account 5201
        let results = allEntries.filter(entry => 
            entry.account?.accountNumber === LANDLORD_DEPOSIT_ACCOUNT_NUMBER
        );
        
        // --- LOG RAW RESULTS FOR DEBUGGING ---
        console.log(`[LandlordDeposits DEBUG] Fetched ${allEntries.length} raw entries. Filtered to ${results.length} entries for account ${LANDLORD_DEPOSIT_ACCOUNT_NUMBER}.`);
        const targetEntry = results.find(e => e.entryNumber === 503408);
        if (targetEntry) {
            console.log("[LandlordDeposits DEBUG] FOUND TARGET ENTRY 503408. RAW DATA:", JSON.stringify(targetEntry, null, 2));
        } else {
            console.log("[LandlordDeposits DEBUG] Target entry 503408 NOT found in filtered results.");
        }
        // --- END LOGGING ---
        
        dismissToast(toastId);
        showSuccess(`Successfully fetched ${results.length} entries for account ${LANDLORD_DEPOSIT_ACCOUNT_NUMBER}.`);
        return results as EconomicLedgerEntry[];
      } catch (e: any) {
        dismissToast(toastId);
        showError(e.message || "Failed to fetch ledger entries.");
        return [];
      } finally {
        setIsFetching(false);
      }
    },
    enabled: !!session, // Always enabled when session is active
    staleTime: 0,
  });

  // Apply client-side filter based on debouncedFilterTerm (SKU)
  const resultsToDisplay = useMemo(() => {
    if (!allAccountEntries) return [];
    if (!debouncedFilterTerm) return allAccountEntries;

    const numericTerm = parseInt(debouncedFilterTerm, 10);
    return allAccountEntries.filter(entry => 
        entry.department?.departmentNumber === numericTerm
    );
  }, [allAccountEntries, debouncedFilterTerm]);


  const handleSearch = () => {
    const term = departmentSearchTerm.trim();
    if (term.length > 0) {
        // 1. Remove SKU prefix (CH/UK) if present
        const numericTerm = term.replace(/^(CH|UK)/i, '');
        
        // 2. Validate if the remaining part is purely numeric
        if (/^\d+$/.test(numericTerm)) {
            setDebouncedFilterTerm(numericTerm);
            // No need to refetch the main query, as it's independent of the search term now.
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
            {/* Removed showDepartmentWarning Alert */}
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
                disabled={isFetching || departmentSearchTerm.trim().length === 0}
                className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm"
              >
                <Search className="mr-2 h-4 w-4" />
                {isFetching ? "Searching..." : "Search Entries"}
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

            {/* Display Search Results Summary */}
            {debouncedFilterTerm.length > 0 && (
                <Card className="border-l-4 border-dyad-blue shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-semibold">
                            Results for SKU: {debouncedFilterTerm}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoadingEntries || isFetching ? (
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
        isLoading={isLoadingEntries || isFetching} 
        defaultSort={{ key: 'date', direction: 'descending' }} 
      />
    </div>
  );
};

export default LandlordDeposits;