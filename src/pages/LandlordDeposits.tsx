"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
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
  const [debouncedDepartmentNumber, setDebouncedDepartmentNumber] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [dialogData, setDialogData] = useState<EconomicLedgerEntry[] | null>(null);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogDescription, setDialogDescription] = useState('');

  const { data: departments, isLoading: isLoadingDepartments } = useDepartments(currentCountry);

  const departmentMap = useMemo(() => {
    if (!departments) return new Map<number, string>();
    return new Map(departments.map(d => [d.departmentNumber, d.name]));
  }, [departments]);

  const getDepartmentName = (deptNumber: number | null | undefined): string => {
    if (!deptNumber) return 'N/A';
    return departmentMap.get(deptNumber) || `Dept #${deptNumber} (Name Not Found)`;
  };

  // Debounce logic for search input
  React.useEffect(() => {
    const handler = setTimeout(() => {
      const numericValue = parseInt(departmentSearchTerm.replace(/\D/g, ''), 10);
      if (!isNaN(numericValue) && departmentSearchTerm.length > 0) {
        setDebouncedDepartmentNumber(numericValue);
      } else {
        setDebouncedDepartmentNumber(null);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [departmentSearchTerm]);

  // Query to fetch ALL entries for the Landlord Deposit Account (5201) across all years
  const { data: allAccountEntries, isLoading: isLoadingEntries, error: entriesError, refetch } = useQuery<EconomicLedgerEntry[]>({
    queryKey: ['landlordDepositEntries_All', currentCountry],
    queryFn: async () => {
      const toastId = showLoading(`Fetching all entries for account ${LANDLORD_DEPOSIT_ACCOUNT_NUMBER}...`);
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
        
        // Client-side filter by account number (5201)
        const filteredByAccount = allEntries.filter(entry => 
          entry.account?.accountNumber === LANDLORD_DEPOSIT_ACCOUNT_NUMBER
        );

        // NEW LOGGING: Log the department numbers of the found entries
        const departmentNumbers = filteredByAccount.map(entry => entry.department?.departmentNumber).filter(Boolean);
        console.log(`[LandlordDeposits] Found entries for account ${LANDLORD_DEPOSIT_ACCOUNT_NUMBER} with department numbers:`, departmentNumbers);

        dismissToast(toastId);
        showSuccess(`Successfully fetched ${allEntries.length} raw entries. Filtered to ${filteredByAccount.length} for account ${LANDLORD_DEPOSIT_ACCOUNT_NUMBER}.`);
        console.log("[LandlordDeposits] Raw fetched entries (first 5):", allEntries.slice(0, 5));
        return filteredByAccount as EconomicLedgerEntry[];
      } catch (e: any) {
        dismissToast(toastId);
        showError(e.message || "Failed to fetch ledger entries.");
        return [];
      } finally {
        setIsFetching(false);
      }
    },
    enabled: false, // Only run manually via button click
    staleTime: 0,
  });

  // Client-side filtering based on debouncedDepartmentNumber
  const filteredEntries = useMemo(() => {
    if (!allAccountEntries) return [];
    if (!debouncedDepartmentNumber) return [];

    const results = allAccountEntries.filter(entry => {
      const entryDeptNumber = entry.department?.departmentNumber;
      // Check if the department number exists and matches the search term
      return entryDeptNumber === debouncedDepartmentNumber;
    });
    
    console.log(`[LandlordDeposits] Filtered ${results.length} entries for department ${debouncedDepartmentNumber}.`);
    return results;
  }, [allAccountEntries, debouncedDepartmentNumber]);

  const handleSearch = () => {
    if (debouncedDepartmentNumber) {
        // Refetch all entries for the account, then filtering happens in useMemo
        refetch();
    } else {
        showError("Please enter a valid department number (SKU).");
    }
  };

  const handleViewDetails = (entries: EconomicLedgerEntry[]) => {
    if (entries.length === 0) return;
    setDialogData(entries);
    setDialogTitle(`Ledger Entries for Department #${debouncedDepartmentNumber}`);
    setDialogDescription(`Showing ${entries.length} transactions booked to Account ${LANDLORD_DEPOSIT_ACCOUNT_NUMBER} for ${getDepartmentName(debouncedDepartmentNumber)}.`);
    setShowDetailDialog(true);
  };

  const ledgerColumns: DialogColumn[] = [
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'entryDate'] },
    { key: 'entryNumber', header: 'Entry No.', path: ['entryNumber', 'number', 'id'] },
    { key: 'entryType', header: 'Entry Type', path: ['entryType', 'type'] },
    { key: 'text', header: 'Text', path: ['text', 'description'] },
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
            Search for all transactions booked to the Landlord Deposit account ({LANDLORD_DEPOSIT_ACCOUNT_NUMBER}) filtered by a specific property department number (SKU).
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
                <label htmlFor="department-search" className="block text-sm font-medium text-gray-700 mb-1">Department Number (SKU)</label>
                <Input
                  id="department-search"
                  placeholder="e.g., 12345"
                  value={departmentSearchTerm}
                  onChange={(e) => setDepartmentSearchTerm(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  className="w-full"
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={isFetching || !debouncedDepartmentNumber}
                className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm"
              >
                <Search className="mr-2 h-4 w-4" />
                {isFetching ? "Searching..." : "Search Entries"}
              </Button>
            </div>

            {/* Display Search Results Summary */}
            {debouncedDepartmentNumber && (
                <Card className="border-l-4 border-dyad-blue shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-semibold">
                            Results for {getDepartmentName(debouncedDepartmentNumber)}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoadingEntries || isFetching ? (
                            <Skeleton className="h-8 w-full" />
                        ) : filteredEntries && filteredEntries.length > 0 ? (
                            <div className="flex justify-between items-center">
                                <p className="text-2xl font-bold text-green-600">
                                    {filteredEntries.length} Entries Found
                                </p>
                                <Button onClick={() => handleViewDetails(filteredEntries)} variant="outline">
                                    <FileText className="mr-2 h-4 w-4" /> View Details
                                </Button>
                            </div>
                        ) : (
                            <p className="text-muted-foreground">
                                No entries found for Department #{debouncedDepartmentNumber} booked to account {LANDLORD_DEPOSIT_ACCOUNT_NUMBER}.
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