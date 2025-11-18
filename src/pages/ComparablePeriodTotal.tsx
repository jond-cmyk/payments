"use client";

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
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
import { formatAmount, extractList } from '@/components/economic/EconomicDetailDialog';
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

const getDepartmentNumberFromEntry = (entry: any): number | null => {
  const candidates = [
    entry?.departmentalDistribution?.departmentalDistributionNumber,
    entry?.department?.departmentNumber,
    entry?.departmentNumber,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number') return candidate;
    if (typeof candidate === 'string' && /^\d+$/.test(candidate)) return parseInt(candidate, 10);
  }

  const selfUrl = entry?.departmentalDistribution?.self;
  if (selfUrl && typeof selfUrl === 'string') {
    const match = selfUrl.match(/\/(\d+)$/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return null;
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
    totals: { period1: number, period2: number, period3: number }
  } | null>({
    queryKey: ['comparablePeriodTotal', selectedSku, selectedYear, selectedMonth, currentCountry],
    queryFn: async () => {
      if (!selectedSku || !selectedYear || !selectedMonth) {
        throw new Error("SKU, Year, and Month must be selected.");
      }

      const toastId = showLoading("Generating P&L report...");
      try {
        const fetchAndProcessPeriod = async (date: Date, sku: string) => {
          const startDate = format(startOfMonth(date), 'yyyy-MM-dd');
          const endDate = format(endOfMonth(date), 'yyyy-MM-dd');
          
          const { data: yearsData } = await supabase.functions.invoke("economic-api-proxy", {
            body: { path: "/accounting-years", method: "GET", country: currentCountry },
          });
          const yearsResp = yearsData as EconomicProxyResponse<any>;
          if (yearsResp.error || !yearsResp.ok) throw new Error(yearsResp.error || `Failed to fetch accounting years: Status ${yearsResp.status}`);
          const accountingYears = extractList(yearsResp?.data);
          if (!accountingYears || accountingYears.length === 0) throw new Error("No accounting years found.");

          let allEntries: any[] = [];
          const yearPromises = accountingYears.map(async (yearInfo: any) => {
            const path = `/accounting-years/${yearInfo.year}/entries`;
            const query = {
              'date$gte': startDate,
              'date$lte': endDate,
              'pagesize': 1000
            };
            const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
              body: { path, method: "GET", query, country: currentCountry },
            });
            if (error) { console.warn(`Error fetching entries for year ${yearInfo.year}:`, error.message); return []; }
            const resp = data as EconomicProxyResponse<any>;
            return resp.ok ? extractList(resp.data) : [];
          });

          const results = await Promise.all(yearPromises);
          allEntries = results.flat();

          const numericSku = parseInt(sku, 10);
          const filteredEntries = allEntries.filter(entry => {
            const deptNum = getDepartmentNumberFromEntry(entry);
            return deptNum === numericSku;
          });
          
          const balanceMap = new Map<number, { name: string, total: number }>();
          for (const entry of filteredEntries) {
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

        const baseDate = new Date(parseInt(selectedYear), parseInt(selectedMonth));
        const period1Date = baseDate;
        const period2Date = subMonths(baseDate, 1);
        const period3Date = subMonths(baseDate, 2);

        const [period1Map, period2Map, period3Map] = await Promise.all([
          fetchAndProcessPeriod(period1Date, selectedSku),
          fetchAndProcessPeriod(period2Date, selectedSku),
          fetchAndProcessPeriod(period3Date, selectedSku),
        ]);

        const allAccountNumbers = new Set([
          ...Array.from(period1Map.keys()),
          ...Array.from(period2Map.keys()),
          ...Array.from(period3Map.keys()),
        ]);

        const lines: ReportLine[] = Array.from(allAccountNumbers).map(accountNumber => {
          const p1Data = period1Map.get(accountNumber);
          const p2Data = period2Map.get(accountNumber);
          const p3Data = period3Map.get(accountNumber);
          return {
            accountNumber,
            name: p1Data?.name || p2Data?.name || p3Data?.name || `Account ${accountNumber}`,
            period1Total: p1Data?.total || 0,
            period2Total: p2Data?.total || 0,
            period3Total: p3Data?.total || 0,
          };
        }).sort((a, b) => a.accountNumber - b.accountNumber);

        const totals = {
          period1: Array.from(period1Map.values()).reduce((sum, acc) => sum + acc.total, 0),
          period2: Array.from(period2Map.values()).reduce((sum, acc) => sum + acc.total, 0),
          period3: Array.from(period3Map.values()).reduce((sum, acc) => sum + acc.total, 0),
        };

        dismissToast(toastId);
        showSuccess("Report generated successfully.");
        return {
          lines,
          periodHeaders: [format(period1Date, 'MMMM yyyy'), format(period2Date, 'MMMM yyyy'), format(period3Date, 'MMMM yyyy')],
          totals,
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
                                <TableCell className="text-right">{formatAmount(line.period1Total)}</TableCell>
                                <TableCell className="text-right">{formatAmount(line.period2Total)}</TableCell>
                                <TableCell className="text-right">{formatAmount(line.period3Total)}</TableCell>
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
    </div>
  );
};

export default ComparablePeriodTotal;