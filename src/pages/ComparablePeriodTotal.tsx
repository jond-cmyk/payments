"use client";

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BarChart, Search } from 'lucide-react';
import { exportToCsv } from '@/utils/exportToCsv';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import DatePicker from '@/components/DatePicker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useCountry } from '@/integrations/supabase/CountryContext';
import CountrySelector from '@/components/CountrySelector';
import { formatAmount, extractList } from '@/components/economic/EconomicDetailDialog';
import { showError, showLoading, dismissToast, showSuccess } from '@/utils/toast';

type EconomicProxyResponse<T = any> = {
  ok?: boolean;
  status?: number;
  data?: T;
  error?: string;
};

type ReportLine = {
  accountNumber: number;
  name: string;
  total: number;
  comparativeTotal: number;
};

const ComparablePeriodTotal = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry, isCountryLocked, availableCountries } = useCountry();
  const navigate = useNavigate();

  const [period1EndDate, setPeriod1EndDate] = useState<Date | undefined>(new Date());
  const [period2EndDate, setPeriod2EndDate] = useState<Date | undefined>(new Date());
  const [enabled, setEnabled] = useState(false);

  const isAdmin = userProfile?.role === 'admin';

  const { data: reportData, isLoading, error, refetch } = useQuery<{ lines: ReportLine[], totals: any, comparativeTotals: any } | null>({
    queryKey: ['comparablePeriodTotal', period1EndDate, period2EndDate, currentCountry],
    queryFn: async () => {
      if (!period1EndDate || !period2EndDate) {
        throw new Error("Both period end dates must be selected.");
      }

      const toastId = showLoading("Generating report by comparing two trial balances...");
      try {
        const fetchTrialBalance = async (date: Date) => {
          const path = `/reports/trial-balance`;
          const query = { date: format(date, 'yyyy-MM-dd') };
          const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
            body: { path, method: "GET", query, country: currentCountry },
          });
          if (error) throw new Error(error.message);
          const resp = data as EconomicProxyResponse<any>;
          if (resp.error || !resp.ok) throw new Error(resp.error || `Failed to generate report for ${format(date, 'PPP')}: Status ${resp.status}`);
          return resp.data;
        };

        const [period1Data, period2Data] = await Promise.all([
          fetchTrialBalance(period1EndDate),
          fetchTrialBalance(period2EndDate),
        ]);

        const period1Lines = period1Data?.lines || [];
        const period2Lines = period2Data?.lines || [];

        const mergedData: Map<number, ReportLine> = new Map();

        period1Lines.forEach((line: any) => {
          mergedData.set(line.accountNumber, {
            accountNumber: line.accountNumber,
            name: line.name,
            total: line.total,
            comparativeTotal: 0,
          });
        });

        period2Lines.forEach((line: any) => {
          if (mergedData.has(line.accountNumber)) {
            const existing = mergedData.get(line.accountNumber)!;
            existing.comparativeTotal = line.total;
          } else {
            mergedData.set(line.accountNumber, {
              accountNumber: line.accountNumber,
              name: line.name,
              total: 0,
              comparativeTotal: line.total,
            });
          }
        });

        const finalLines = Array.from(mergedData.values()).sort((a, b) => a.accountNumber - b.accountNumber);

        dismissToast(toastId);
        showSuccess("Report generated successfully.");
        return {
          lines: finalLines,
          totals: period1Data?.totals,
          comparativeTotals: period2Data?.totals,
        };
      } catch (e: any) {
        dismissToast(toastId);
        showError(e.message);
        setEnabled(false); // Disable query on error
        return null;
      }
    },
    enabled: enabled,
    staleTime: Infinity, // Only refetch on manual trigger
  });

  const handleGenerateReport = () => {
    setEnabled(true);
    refetch();
  };

  const handleExport = () => {
    if (reportData?.lines) {
      const dataToExport = reportData.lines.map(line => ({
        'Account Number': line.accountNumber,
        'Account Name': line.name,
        [`Period 1 Total (as of ${format(period1EndDate!, 'yyyy-MM-dd')})`]: line.total,
        [`Period 2 Total (as of ${format(period2EndDate!, 'yyyy-MM-dd')})`]: line.comparativeTotal,
        'Difference': line.total - line.comparativeTotal,
      }));
      exportToCsv(dataToExport, `comparable_period_report_${format(new Date(), 'yyyyMMdd')}.csv`);
    }
  };

  if (isSessionLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }

  if (!session || !isAdmin) {
    navigate("/dashboard");
    return null;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Comparable Period Report - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <BarChart className="mr-2 h-6 w-6" /> Comparable Period Total Report
          </CardTitle>
          <CardDescription>
            Generate a report from e-conomic comparing account totals between two different dates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4 p-4 border rounded-md bg-gray-50 shadow-sm">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <CountrySelector
                  disabled={isCountryLocked && !isAdmin}
                  availableCountries={availableCountries.filter(c => c.value !== 'all')}
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Period 1 End Date</label>
                <DatePicker date={period1EndDate} setDate={setPeriod1EndDate} />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Period 2 End Date</label>
                <DatePicker date={period2EndDate} setDate={setPeriod2EndDate} />
              </div>
              <Button onClick={handleGenerateReport} disabled={isLoading || !period1EndDate || !period2EndDate}>
                <Search className="mr-2 h-4 w-4" />
                {isLoading ? "Generating..." : "Generate Report"}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTitle>Error Generating Report</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            )}

            {reportData && (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Report Results</CardTitle>
                    <Button variant="outline" onClick={handleExport}>Export to CSV</Button>
                  </div>
                  <CardDescription>
                    Comparing totals as of {format(period1EndDate!, 'PPP')} vs. {format(period2EndDate!, 'PPP')}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Period 1 Total</TableHead>
                          <TableHead className="text-right">Period 2 Total</TableHead>
                          <TableHead className="text-right">Difference</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isLoading ? (
                          Array.from({ length: 10 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={4}><Skeleton className="h-6 w-full" /></TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <>
                            {reportData.lines.map((line) => (
                              <TableRow key={line.accountNumber}>
                                <TableCell className="font-medium">{line.accountNumber} - {line.name}</TableCell>
                                <TableCell className="text-right">{formatAmount(line.total)}</TableCell>
                                <TableCell className="text-right">{formatAmount(line.comparativeTotal)}</TableCell>
                                <TableCell className="text-right font-semibold">{formatAmount(line.total - line.comparativeTotal)}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="font-bold bg-muted">
                              <TableCell>Totals</TableCell>
                              <TableCell className="text-right">{formatAmount(reportData.totals?.total)}</TableCell>
                              <TableCell className="text-right">{formatAmount(reportData.comparativeTotals?.total)}</TableCell>
                              <TableCell className="text-right">{formatAmount((reportData.totals?.total || 0) - (reportData.comparativeTotals?.total || 0))}</TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ComparablePeriodTotal;