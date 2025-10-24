"use client";

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Home, FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DatePicker from '@/components/DatePicker';
import EconomicDetailDialog, { DialogColumn, extractList } from '@/components/economic/EconomicDetailDialog';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { useCountry } from '@/integrations/supabase/CountryContext';
import CountrySelector from '@/components/CountrySelector';

type EconomicProxyResponse<T = any> = {
  ok?: boolean;
  status?: number;
  data?: T;
  request?: { url?: string };
  error?: string;
};

const PropertyReports = () => {
  const { session, isLoading, userProfile } = useSession();
  const { currentCountry, setCurrentCountry, isCountryLocked, availableCountries } = useCountry();
  const navigate = useNavigate();

  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [fromDimension, setFromDimension] = useState<string>("");
  const [toDimension, setToDimension] = useState<string>("");

  const [reportData, setReportData] = useState<any[] | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);

  const isAdmin = userProfile?.role === "admin";

  if (isLoading) {
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

  const fetchTrialBalanceReport = useCallback(async () => {
    if (!fromDate || !toDate) {
      showError("Please select both 'From Date' and 'To Date'.");
      return;
    }
    if (!fromDimension || !toDimension) {
      showError("Please enter both 'From Dimension' and 'To Dimension'.");
      return;
    }

    setIsReportLoading(true);
    const toastId = showLoading("Fetching report from e-conomic...");

    try {
      // Step 1: Fetch all accounting years
      const { data: yearsData, error: yearsError } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path: "/accounting-years", method: "GET", country: currentCountry },
      });

      if (yearsError) throw new Error(yearsError.message);
      const yearsResp = yearsData as EconomicProxyResponse<any>;
      if (yearsResp.error || !yearsResp.ok) {
          throw new Error(yearsResp.error || `Failed to fetch accounting years: Status ${yearsResp.status}`);
      }
      const allAccountingYears = extractList(yearsResp?.data);
      if (!allAccountingYears || allAccountingYears.length === 0) {
          showError("No accounting years found in e-conomic. Cannot fetch entries.");
          return;
      }

      // Step 2: Filter accounting years to only those that overlap with the selected date range
      const userFromDate = startOfDay(fromDate);
      const userToDate = endOfDay(toDate);

      const relevantYears = allAccountingYears.filter(year => {
        const yearFromDate = parseISO(year.fromDate);
        const yearToDate = parseISO(year.toDate);
        return yearFromDate <= userToDate && yearToDate >= userFromDate;
      });

      if (relevantYears.length === 0) {
        showError("No accounting years in e-conomic match the selected date range.");
        setReportData([]);
        setIsReportDialogOpen(true);
        return;
      }

      // Step 3: For each relevant year, fetch entries, applying date filters only for closed years.
      let allEntries: any[] = [];

      const yearPromises = relevantYears.map(async (yearInfo) => {
        const year = yearInfo.year;
        const isClosedYear = yearInfo.closed === true;

        const fromDimNum = parseInt(fromDimension, 10);
        const toDimNum = parseInt(toDimension, 10);
        const filters = [];

        // CRITICAL FIX: Only add date filters for closed years at the API level
        if (isClosedYear) {
            const yearFromDate = parseISO(yearInfo.fromDate);
            const yearToDate = parseISO(yearInfo.toDate);
            const effectiveFromDate = userFromDate > yearFromDate ? userFromDate : yearFromDate;
            const effectiveToDate = userToDate < yearToDate ? userToDate : yearToDate;
            filters.push(`date$gte:${format(effectiveFromDate, 'yyyy-MM-dd')}`);
            filters.push(`date$lte:${format(effectiveToDate, 'yyyy-MM-dd')}`);
        }

        if (!isNaN(fromDimNum) && !isNaN(toDimNum)) {
          filters.push(`departmentalDistribution.departmentalDistributionNumber$gte:${fromDimNum}`);
          filters.push(`departmentalDistribution.departmentalDistributionNumber$lte:${toDimNum}`);
        }
        const filterString = filters.join('$and:');

        let pathForProxy = `/accounting-years/${year}/entries`;
        let queryForProxy: Record<string, string> = { pagesize: '1000' };
        if (filterString) {
            queryForProxy.filter = filterString;
        }
        
        let hasMorePages = true;
        while (hasMorePages) {
          const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
            body: { path: pathForProxy, query: queryForProxy, method: "GET", country: currentCountry },
          });

          if (error) {
            console.warn(`Error fetching entries for year ${year}:`, error.message);
            break;
          }

          const resp = data as EconomicProxyResponse<any>;
          if (resp.ok) {
            const entriesForPage = extractList(resp?.data);
            if (entriesForPage && entriesForPage.length > 0) {
              allEntries = allEntries.concat(entriesForPage);
            }
            const nextPageUrl = resp.data?.pagination?.nextPage;
            if (nextPageUrl) {
              const url = new URL(nextPageUrl);
              pathForProxy = url.pathname;
              queryForProxy = Object.fromEntries(url.searchParams.entries());
            } else {
              hasMorePages = false;
            }
          } else {
            console.warn(`Non-OK response for year ${year}: Status ${resp.status}`);
            break;
          }
        }
      });

      await Promise.all(yearPromises);

      // Step 4: Perform a final client-side filter on all fetched entries.
      // This is crucial for entries from open years where no date filter was applied at the API level.
      const filteredEntries = allEntries.filter(entry => {
        const entryDate = entry.date ? parseISO(entry.date) : null;
        return entryDate && isWithinInterval(entryDate, { start: userFromDate, end: userToDate });
      });

      // Step 5: Aggregate the filtered entries
      const trialBalance: Record<string, { accountNumber: number; name: string; debit: number; credit: number; balance: number; }> = {};

      filteredEntries.forEach(entry => {
        const accountNumber = entry.account?.accountNumber;
        const accountName = entry.account?.name || `Account ${accountNumber}`;
        const amount = entry.amount || 0;

        if (!accountNumber) return;

        if (!trialBalance[accountNumber]) {
          trialBalance[accountNumber] = {
            accountNumber: accountNumber,
            name: accountName,
            debit: 0,
            credit: 0,
            balance: 0,
          };
        }

        if (amount > 0) {
          trialBalance[accountNumber].debit += amount;
        } else {
          trialBalance[accountNumber].credit += Math.abs(amount);
        }
        trialBalance[accountNumber].balance += amount;
      });

      const aggregatedData = Object.values(trialBalance);

      setReportData(aggregatedData);
      setIsReportDialogOpen(true);
      showSuccess(`Report generated! Found ${filteredEntries.length} entries, aggregated into ${aggregatedData.length} accounts.`);
    } catch (e: any) {
      console.error("Error fetching Trial Balance report:", e);
      showError(e.message || "Failed to fetch report.");
      setReportData(null);
    } finally {
      dismissToast(toastId);
      setIsReportLoading(false);
    }
  }, [fromDate, toDate, fromDimension, toDimension, currentCountry]);

  const reportColumns: DialogColumn[] = [
    { key: 'accountNumber', header: 'Account No.' },
    { key: 'name', header: 'Account Name' },
    { key: 'debit', header: 'Debit', format: 'amount' },
    { key: 'credit', header: 'Credit', format: 'amount' },
    { key: 'balance', header: 'Balance', format: 'amount' },
  ];

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Property Reports - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <Home className="mr-2 h-6 w-6" /> Property Reports
          </CardTitle>
          <CardDescription>
            Generate 'Trial Balance by Department' reports from e-conomic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="country-selector" className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <CountrySelector
                  value={currentCountry}
                  onValueChange={setCurrentCountry}
                  disabled={isCountryLocked && !isAdmin}
                  availableCountries={isAdmin ? availableCountries : availableCountries.filter(c => c.value === userProfile?.country)}
                />
              </div>
              <div></div> {/* Empty div for alignment */}
              <div>
                <label htmlFor="from-date" className="block text-sm font-medium text-gray-700 mb-1">From Date<span className="text-red-600 ml-1 text-lg font-bold">*</span></label>
                <DatePicker
                  id="from-date"
                  date={fromDate}
                  setDate={setFromDate}
                  placeholder="Select start date"
                  disabled={isReportLoading}
                />
              </div>
              <div>
                <label htmlFor="to-date" className="block text-sm font-medium text-gray-700 mb-1">To Date<span className="text-red-600 ml-1 text-lg font-bold">*</span></label>
                <DatePicker
                  id="to-date"
                  date={toDate}
                  setDate={setToDate}
                  placeholder="Select end date"
                  disabled={isReportLoading}
                />
              </div>
              <div>
                <label htmlFor="from-dimension" className="block text-sm font-medium text-gray-700 mb-1">From Dimension<span className="text-red-600 ml-1 text-lg font-bold">*</span></label>
                <Input
                  id="from-dimension"
                  placeholder="e.g., 1000"
                  value={fromDimension}
                  onChange={(e) => setFromDimension(e.target.value)}
                  disabled={isReportLoading}
                />
              </div>
              <div>
                <label htmlFor="to-dimension" className="block text-sm font-medium text-gray-700 mb-1">To Dimension<span className="text-red-600 ml-1 text-lg font-bold">*</span></label>
                <Input
                  id="to-dimension"
                  placeholder="e.g., 2000"
                  value={toDimension}
                  onChange={(e) => setToDimension(e.target.value)}
                  disabled={isReportLoading}
                />
              </div>
            </div>
            <Button
              onClick={fetchTrialBalanceReport}
              disabled={isReportLoading || !fromDate || !toDate || !fromDimension || !toDimension}
              className="w-full bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm"
            >
              <Search className="mr-2 h-4 w-4" />
              {isReportLoading ? "Generating Report..." : "Generate Report"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <EconomicDetailDialog
        isOpen={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        title="Trial Balance by Department"
        description={`Report for period ${fromDate ? format(fromDate, 'PPP') : ''} to ${toDate ? format(toDate, 'PPP') : ''}${fromDimension || toDimension ? ` (Dimensions: ${fromDimension || 'All'} to ${toDimension || 'All'})` : ''}`}
        data={reportData}
        columns={reportColumns}
        isLoading={isReportLoading}
        defaultSort={{ key: 'accountNumber', direction: 'ascending' }}
      />
    </div>
  );
};

export default PropertyReports;