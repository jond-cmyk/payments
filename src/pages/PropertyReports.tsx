"use client";

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Home, FileText, Search } from 'lucide-react'; // Added Search icon
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DatePicker from '@/components/DatePicker';
import EconomicDetailDialog, { DialogColumn, extractList } from '@/components/economic/EconomicDetailDialog'; // Import extractList
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { format } from 'date-fns';
import { useCountry } from '@/integrations/supabase/CountryContext';

type EconomicProxyResponse<T = any> = {
  ok?: boolean;
  status?: number;
  data?: T;
  request?: { url?: string };
  error?: string;
};

const PropertyReports = () => {
  const { session, isLoading, userProfile } = useSession();
  const { currentCountry } = useCountry();
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

  const fetchDepartmentProfitLossReport = useCallback(async () => {
    if (!fromDate || !toDate) {
      showError("Please select both 'From Date' and 'To Date'.");
      return;
    }

    setIsReportLoading(true);
    const toastId = showLoading("Fetching Department Profit/Loss report...");

    try {
      const queryParams: Record<string, string> = {
        from: format(fromDate, 'yyyy-MM-dd'),
        to: format(toDate, 'yyyy-MM-dd'),
      };

      if (fromDimension) {
        queryParams.fromDimension = fromDimension;
      }
      if (toDimension) {
        queryParams.toDimension = toDimension;
      }

      const queryString = new URLSearchParams(queryParams).toString();
      // UPDATED PATH: Using /accounting-reports/department-profit-loss
      const path = `/accounting-reports/department-profit-loss?${queryString}`;

      const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
        body: { path: path, method: "GET", country: currentCountry },
      });

      if (error) {
        throw new Error(error.message || "Failed to fetch report via proxy.");
      }

      const resp = data as EconomicProxyResponse<any>;

      if (resp?.status && resp.status >= 400) {
        const errorMessage = resp.error || (resp.data as any)?.message || (resp.data as any)?.developerHint || 'Unknown error from e-conomic API';
        throw new Error(`e-conomic API Error: ${errorMessage}`);
      }

      const list = extractList(resp?.data);
      setReportData(list);
      setIsReportDialogOpen(true);
      showSuccess(`Report fetched successfully! Found ${list.length} entries.`);
    } catch (e: any) {
      console.error("Error fetching Department Profit/Loss report:", e);
      showError(e.message || "Failed to fetch report.");
      setReportData(null);
    } finally {
      dismissToast(toastId);
      setIsReportLoading(false);
    }
  }, [fromDate, toDate, fromDimension, toDimension, currentCountry]);

  const reportColumns: DialogColumn[] = [
    { key: 'accountNumber', header: 'Account No.', path: ['account.accountNumber', 'accountNumber'] },
    { key: 'accountName', header: 'Account Name', path: ['account.name', 'accountName'] },
    { key: 'period', header: 'Period', path: ['period'] },
    { key: 'dimension', header: 'Dimension', path: ['dimension.dimensionNumber', 'dimension.name', 'dimension'] },
    { key: 'amount', header: 'Amount', format: 'amount', path: ['amount', 'amount.value'] },
    { key: 'currency', header: 'Currency', path: ['currency', 'currency.code'] },
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
            Generate 'Department Profit/Loss' reports from e-conomic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <label htmlFor="from-dimension" className="block text-sm font-medium text-gray-700 mb-1">From Dimension (Optional)</label>
                <Input
                  id="from-dimension"
                  placeholder="e.g., 1000"
                  value={fromDimension}
                  onChange={(e) => setFromDimension(e.target.value)}
                  disabled={isReportLoading}
                />
              </div>
              <div>
                <label htmlFor="to-dimension" className="block text-sm font-medium text-gray-700 mb-1">To Dimension (Optional)</label>
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
              onClick={fetchDepartmentProfitLossReport}
              disabled={isReportLoading || !fromDate || !toDate}
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
        title="Department Profit/Loss Report"
        description={`Report for period ${fromDate ? format(fromDate, 'PPP') : ''} to ${toDate ? format(toDate, 'PPP') : ''}${fromDimension || toDimension ? ` (Dimensions: ${fromDimension || 'All'} to ${toDimension || 'All'})` : ''}`}
        data={reportData}
        columns={reportColumns}
        isLoading={isReportLoading}
        defaultSort={{ key: 'period', direction: 'descending' }}
      />
    </div>
  );
};

export default PropertyReports;