"use client";

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { BarChart, Search, FileDown } from 'lucide-react';
import { exportToCsv } from '@/utils/exportToCsv';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useCountry } from '@/integrations/supabase/CountryContext';
import CountrySelector from '@/components/CountrySelector';
import EconomicDetailDialog, { DialogColumn, formatAmount, extractList } from '@/components/economic/EconomicDetailDialog';
import { showError, showLoading, dismissToast, showSuccess } from '@/utils/toast';
import { useDepartments } from '@/hooks/useDepartments';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type EconomicProxyResponse<T = any> = {
  ok?: boolean;
  status?: number;
  data?: T;
  error?: string;
};

type ReportLine = {
  accountNumber: number;
  name: string;
  period1Total: number;
  period2Total: number;
  period3Total: number;
};

const ComparablePeriodTotal = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry, isCountryLocked, availableCountries } = useCountry();
  const navigate = useNavigate();

  const lastMonthDate = subMonths(new Date(), 1);
  const [selectedSku, setSelectedSku] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>(String(lastMonthDate.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(lastMonthDate.getMonth())); // 0-indexed
  const [enabled, setEnabled] = useState(false);
  const [departmentSearchOpen, setDepartmentSearchOpen] = useState(false);

  // State for the details dialog
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogData, setDialogData] = useState<any[] | null>(null);

  const isAdmin = userProfile?.role === 'admin';

  const { data: departments, isLoading: isLoadingDepartments } = useDepartments(currentCountry);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const yearsArray = [];
    for (let year = currentYear; year >= 2024; year--) {
      yearsArray.push(String(year));
    }
    return yearsArray;
  }, []);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      value: String(i),
      label: format(new Date(2000, i, 1), 'MMMM'),
    }));
  }, []);

  const { data: reportData, isLoading, error, refetch } = useQuery<{
    lines: ReportLine[],
    periodHeaders: string[],
    totals: { period1: number, period2: number, period3: number },
    period1Entries: any[],
    period2Entries: any[],
    period3Entries: any[],
  } | null>({
    queryKey: ['comparablePeriodTotal', selectedSku, selectedYear, selectedMonth, currentCountry],
    queryFn: async () => {
      if (!selectedSku) throw new Error("SKU must be selected.");

      const toastId = showLoading("Generating P&L report...");
      try {
        const numericSku = parseInt(selectedSku, 10);
        const path = `/departments/${numericSku}/entries`;
        const query = { pagesize: 1000 };

        let allEntriesForSku: any[] = [];
        let currentPage = 0;
        while (true) {
          const paginatedQuery = { ...query, skipPages: String(currentPage) };
          const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
            body: { path, method: "GET", query: paginatedQuery, country: currentCountry },
          });

          if (error) throw new Error(error.message);
          const resp = data as EconomicProxyResponse<any>;
          if (resp.error || !resp.ok) {
            if (resp.status === 404) throw new Error(`The e-conomic endpoint for department entries was not found (404). This feature may not be available on your plan.`);
            throw new Error(resp.error || `Failed to fetch entries for SKU ${selectedSku}: Status ${resp.status}`);
          }

          const entries = extractList(resp.data);
          if (!entries || entries.length === 0) break;
          allEntriesForSku = allEntriesForSku.concat(entries);
          if (entries.length < 1000) break;
          currentPage++;
        }

        const baseDate = new Date(parseInt(selectedYear), parseInt(selectedMonth));
        const period1Date = baseDate;
        const period2Date = subMonths(baseDate, 1);
        const period3Date = subMonths(baseDate, 2);

        const period1Interval = { start: startOfMonth(period1Date), end: endOfMonth(period1Date) };
        const period2Interval = { start: startOfMonth(period2Date), end: endOfMonth(period2Date) };
        const period3Interval = { start: startOfMonth(period3Date), end: endOfMonth(period3Date) };

        const period1Entries = allEntriesForSku.filter(e => e.date && isWithinInterval(parseISO(e.date), period1Interval));
        const period2Entries = allEntriesForSku.filter(e => e.date && isWithinInterval(parseISO(e.date), period2Interval));
        const period3Entries = allEntriesForSku.filter(e => e.date && isWithinInterval(parseISO(e.date), period3Interval));

        const processPeriod = (entries: any[]) => {
          const balanceMap = new Map<number, { name: string, total: number }>();
          for (const entry of entries) {
            const accountNumber = entry.account?.accountNumber;
            const accountName = entry.account?.name;
            const amount = entry.amount || 0;
            if (accountNumber) {
              if (!balanceMap.has(accountNumber)) {
                balanceMap.set(accountNumber, { name: accountName || `Account ${accountNumber}`, total: 0 });
              }
              balanceMap.get(accountNumber)!.total += amount;
            }
          }
          return balanceMap;
        };

        const period1Map = processPeriod(period1Entries);
        const period2Map = processPeriod(period2Entries);
        const period3Map = processPeriod(period3Entries);

        const allAccountNumbers = new Set([...period1Map.keys(), ...period2Map.keys(), ...period3Map.keys()]);

        const lines: ReportLine[] = Array.from(allAccountNumbers).map(accountNumber => ({
          accountNumber,
          name: period1Map.get(accountNumber)?.name || period2Map.get(accountNumber)?.name || period3Map.get(accountNumber)?.name || `Account ${accountNumber}`,
          period1Total: period1Map.get(accountNumber)?.total || 0,
          period2Total: period2Map.get(accountNumber)?.total || 0,
          period3Total: period3Map.get(accountNumber)?.total || 0,
        })).sort((a, b) => a.accountNumber - b.accountNumber);

        const totals = {
          period1: lines.reduce((sum, line) => sum + line.period1Total, 0),
          period2: lines.reduce((sum, line) => sum + line.period2Total, 0),
          period3: lines.reduce((sum, line) => sum + line.period3Total, 0),
        };

        dismissToast(toastId);
        showSuccess("Report generated successfully.");
        return {
          lines,
          periodHeaders: [format(period1Date, 'MMMM yyyy'), format(period2Date, 'MMMM yyyy'), format(period3Date, 'MMMM yyyy')],
          totals,
          period1Entries,
          period2Entries,
          period3Entries,
        };
      } catch (e: any) {
        dismissToast(toastId);
        showError(e.message);
        setEnabled(false);
        return null;
      }
    },
    enabled: enabled,
    staleTime: Infinity,
  });

  const handleGenerateReport = () => {
    if (!selectedSku) {
      showError("Please select a property/SKU.");
      return;
    }
    setEnabled(true);
    refetch();
  };

  const handleExport = () => {
    if (reportData?.lines && reportData.periodHeaders) {
      const dataToExport = reportData.lines.map(line => ({
        'Account Number': line.accountNumber,
        'Account Name': line.name,
        [reportData.periodHeaders[0]]: line.period1Total,
        [reportData.periodHeaders[1]]: line.period2Total,
        [reportData.periodHeaders[2]]: line.period3Total,
      }));
      exportToCsv(dataToExport, `p&l_report_${selectedSku}_${format(new Date(), 'yyyyMMdd')}.csv`);
    }
  };

  const handleViewDetails = (accountNumber: number, periodIndex: number) => {
    if (!reportData) return;
    const periodEntries = [reportData.period1Entries, reportData.period2Entries, reportData.period3Entries][periodIndex];
    const accountEntries = periodEntries.filter(e => e.account?.accountNumber === accountNumber);
    setDialogData(accountEntries);
    setDialogTitle(`Transactions for Account ${accountNumber} - ${reportData.periodHeaders[periodIndex]}`);
    setIsDetailDialogOpen(true);
  };

  const detailColumns: DialogColumn[] = [
    { key: 'date', header: 'Date', format: 'date' },
    { key: 'entryNumber', header: 'Entry No.' },
    { key: 'text', header: 'Text' },
    { key: 'amount', header: 'Amount', format: 'currencyAmount' },
  ];

  if (isSessionLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  }

  if (!session || !isAdmin) {
    navigate("/dashboard");
    return null;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="P&L Report - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <BarChart className="mr-2 h-6 w-6" /> P&L Report by Property
          </CardTitle>
          <CardDescription>
            Generate a Profit & Loss report for a specific property, comparing the selected month with the two previous months.
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
              <div className="flex-1 min-w-[250px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Property / SKU*</label>
                <Popover open={departmentSearchOpen} onOpenChange={setDepartmentSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={departmentSearchOpen}
                      className="w-full justify-between"
                      disabled={isLoadingDepartments}
                    >
                      {selectedSku
                        ? departments?.find((dept) => String(dept.departmentNumber) === selectedSku)?.name
                        : "Select property..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                      <CommandInput placeholder="Search property..." />
                      <CommandList>
                        <CommandEmpty>No property found.</CommandEmpty>
                        <CommandGroup>
                          {departments?.map((dept) => (
                            <CommandItem
                              key={dept.departmentNumber}
                              value={`${dept.name} ${dept.departmentNumber}`}
                              onSelect={() => {
                                setSelectedSku(String(dept.departmentNumber));
                                setDepartmentSearchOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedSku === String(dept.departmentNumber) ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {dept.name} ({dept.departmentNumber})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map(year => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {months.map(month => <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleGenerateReport} disabled={isLoading || !selectedSku}>
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
                    <CardTitle>Report Results for SKU {selectedSku}</CardTitle>
                    <Button variant="outline" onClick={handleExport}>Export to CSV</Button>
                  </div>
                  <CardDescription>
                    Comparing P&L for {reportData.periodHeaders.join(', ')}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          {reportData.periodHeaders.map(header => (
                            <TableHead key={header} className="text-right">{header}</TableHead>
                          ))}
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
                                <TableCell className="text-right">
                                  <Button variant="link" onClick={() => handleViewDetails(line.accountNumber, 0)}>{formatAmount(line.period1Total)}</Button>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button variant="link" onClick={() => handleViewDetails(line.accountNumber, 1)}>{formatAmount(line.period2Total)}</Button>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button variant="link" onClick={() => handleViewDetails(line.accountNumber, 2)}>{formatAmount(line.period3Total)}</Button>
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="font-bold bg-muted">
                              <TableCell>Totals</TableCell>
                              <TableCell className="text-right">{formatAmount(reportData.totals?.period1)}</TableCell>
                              <TableCell className="text-right">{formatAmount(reportData.totals?.period2)}</TableCell>
                              <TableCell className="text-right">{formatAmount(reportData.totals?.period3)}</TableCell>
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
      <EconomicDetailDialog
        isOpen={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        title={dialogTitle}
        data={dialogData}
        columns={detailColumns}
        isLoading={false}
      />
    </div>
  );
};

export default ComparablePeriodTotal;