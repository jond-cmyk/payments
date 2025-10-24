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
import { format, isWithinInterval, parseISO } from 'date-fns';
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
    const toastId = showLoading("Fetching accounting years and entries...");

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
      const accountingYears = extractList(yearsResp?.data);
      if (!accountingYears || accountingYears.length === 0) {
          showError("No accounting years found in e-conomic. Cannot fetch entries.");
          return;
      }

      // Step 2: For each year, fetch all entries
      let allEntries: any[] = [];

      const yearPromises = accountingYears.map(yearInfo => {
          const year = yearInfo.year;
          const path = `/accounting-years/${year}/entries?pagesize=1000`; // No filter, fetch all
          return supabase.functions.invoke("economic-api-proxy", {
              body: { path, method: "GET", country: currentCountry },
          });
      });

      const yearResults = await Promise.all(yearPromises);

      // Step 3: Combine results from all years
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

      // Step 4: Filter combined entries in our code for reliability
      const fromDimNum = parseInt(fromDimension, 10);
      const toDimNum = parseInt(toDimension, 10);

      const filteredEntries = allEntries.filter(entry => {
        // Date filter
        const entryDate = entry.date ? parseISO(entry.date) : null;
        if (!entryDate || !isWithinInterval(entryDate, { start: fromDate, end: toDate })) {
            return false;
        }

        // Dimension filter
        if (!isNaN(fromDimNum) && !isNaN(toDimNum)) {
            const deptNum = entry.department?.departmentNumber;
            if (!deptNum || deptNum < fromDimNum || deptNum > toDimNum) {
                return false;
            }
        }
        
        return true;
      });

      // Step 5: Aggregate the filtered entries into a trial balance format
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