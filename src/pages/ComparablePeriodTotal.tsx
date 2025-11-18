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
  periodTotals: number[];
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
  const [numPeriods, setNumPeriods] = useState<number>(3); // New state for number of periods
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
    revenueLines: ReportLine[],
    directCostsLines: ReportLine[],
    additionalCostsLines: ReportLine[],
    revenueSubtotals: { periodTotals: number[] },
    directCostsSubtotals: { periodTotals: number[] },
    additionalCostsSubtotals: { periodTotals: number[] },
    profitLoss: { periodTotals: number[] },
    assetPurchasesBalance: number,
    periodHeaders: string[],
    periodEntries: any[][],
  } | null>({
    queryKey: ['comparablePeriodTotal', selectedSku, selectedYear, selectedMonth, currentCountry, numPeriods],
    queryFn: async () => {
      if (!selectedSku) throw new Error("SKU must be selected.");

      const toastId = showLoading("Generating P&L report...");
      try {
        const { data: accountsData } = await supabase.functions.invoke("economic-api-proxy", {
          body: { path: "/accounts?pagesize=1000", method: "GET", country: currentCountry },
        });
        const accountsResp = accountsData as EconomicProxyResponse<any>;
        if (accountsResp.error || !accountsResp.ok) throw new Error("Failed to fetch accounts list from e-conomic.");
        const allAccounts = extractList(accountsResp?.data);
        const accountNameMap = new Map<number, string>();
        allAccounts.forEach((acc: any) => {
          if (acc.accountNumber && acc.name) {
            accountNameMap.set(acc.accountNumber, acc.name);
          }
        });

        const fetchAndProcessPeriod = async (date: Date, sku: string) => {
          const startDate = format(startOfMonth(date), 'yyyy-MM-dd');
          const endDate = format(endOfMonth(date), 'yyyy-MM-dd');
          const numericSku = parseInt(sku, 10);

          const { data: yearsData } = await supabase.functions.invoke("economic-api-proxy", {
            body: { path: "/accounting-years", method: "GET", country: currentCountry },
          });
          const yearsResp = yearsData as EconomicProxyResponse<any>;
          if (yearsResp.error || !yearsResp.ok) throw new Error(yearsResp.error || `Failed to fetch accounting years: Status ${yearsResp.status}`);
          const accountingYears = extractList(yearsResp?.data);
          if (!accountingYears || accountingYears.length === 0) throw new Error("No accounting years found.");

          const targetYearInfo = accountingYears.find((y: any) => {
              const from = y.fromDate ? new Date(y.fromDate) : null;
              const to = y.toDate ? new Date(y.toDate) : null;
              return from && to && isWithinInterval(date, { start: from, end: to });
          });

          if (!targetYearInfo) {
              console.warn(`No accounting year found for date ${format(date, 'yyyy-MM-dd')}. Skipping period.`);
              return { balanceMap: new Map(), filteredEntries: [] };
          }

          const path = `/accounting-years/${targetYearInfo.year}/entries`;
          const filterString = `date$gte:${startDate}$and:date$lte:${endDate}`;
          
          let allEntriesForMonth: any[] = [];
          let currentPage = 0;
          while (true) {
            const { data, error } = await supabase.functions.invoke("economic-api-proxy", {
              body: { path: `${path}?pagesize=1000&skipPages=${currentPage}&filter=${filterString}`, method: "GET", country: currentCountry },
            });

            if (error) throw new Error(error.message);
            const resp = data as EconomicProxyResponse<any>;
            if (resp.error || !resp.ok) {
              console.error(`Failed to fetch entries page ${currentPage} for ${format(date, 'MMMM yyyy')}: Status ${resp.status}`);
              break;
            }

            const entries = extractList(resp.data);
            if (!entries || entries.length === 0) break;
            allEntriesForMonth = allEntriesForMonth.concat(entries);
            if (entries.length < 1000) break;
            currentPage++;
          }

          const enrichedEntries = await Promise.all(allEntriesForMonth.map(async (entry) => {
              let deptNum = getDepartmentNumberFromEntry(entry);
              if (deptNum !== null) {
                  return { ...entry, finalDepartmentNumber: deptNum };
              }

              const invoiceSelf = entry.invoice?.self;
              if (invoiceSelf) {
                  try {
                      const invoicePath = new URL(invoiceSelf).pathname;
                      const { data: invoiceData, error: invoiceError } = await supabase.functions.invoke("economic-api-proxy", {
                          body: { path: invoicePath, method: "GET", country: currentCountry },
                      });
                      if (invoiceError || !invoiceData || (invoiceData as any).error) {
                          return { ...entry, finalDepartmentNumber: null };
                      }
                      const fullInvoice = (invoiceData as any).data;
                      deptNum = getDepartmentNumberFromEntry(fullInvoice);
                      return { ...entry, finalDepartmentNumber: deptNum };
                  } catch (e: any) {
                      console.warn(`Could not enrich entry ${entry.entryNumber} from invoice: ${e.message}`);
                      return { ...entry, finalDepartmentNumber: null };
                  }
              }
              return { ...entry, finalDepartmentNumber: null };
          }));

          const filteredEntries = enrichedEntries.filter(entry => entry.finalDepartmentNumber === numericSku);
          
          const balanceMap = new Map<number, { name: string, total: number }>();
          for (const entry of filteredEntries) {
            const accountNumber = entry.account?.accountNumber;
            const accountName = accountNameMap.get(accountNumber) || entry.account?.name;
            const amount = entry.amount || 0;
            if (accountNumber) {
              if (!balanceMap.has(accountNumber)) {
                balanceMap.set(accountNumber, { name: accountName || `Account ${accountNumber}`, total: 0 });
              }
              balanceMap.get(accountNumber)!.total += amount;
            }
          }
          return { balanceMap, filteredEntries };
        };

        const fetchCumulativeBalance = async (accountNumber: number, sku: string) => {
          const numericSku = parseInt(sku, 10);
          const { data: yearsData } = await supabase.functions.invoke("economic-api-proxy", {
            body: { path: "/accounting-years", method: "GET", country: currentCountry },
          });
          const yearsResp = yearsData as EconomicProxyResponse<any>;
          if (yearsResp.error || !yearsResp.ok) throw new Error(yearsResp.error || `Failed to fetch accounting years: Status ${yearsResp.status}`);
          const accountingYears = extractList(yearsResp?.data);
          if (!accountingYears || accountingYears.length === 0) return 0;

          let allEntriesForAccount: any[] = [];
          const yearPromises = accountingYears.map(async (yearInfo: any) => {
            const path = `/accounts/${accountNumber}/accounting-years/${yearInfo.year}/entries?pagesize=1000`;
            const { data, error } = await supabase.functions.invoke("economic-api-proxy", { body: { path, method: "GET", country: currentCountry } });
            if (!error && data) {
              const resp = data as EconomicProxyResponse<any>;
              if (resp.ok) {
                return extractList(resp.data) || [];
              }
            }
            return [];
          });
          const results = await Promise.all(yearPromises);
          allEntriesForAccount = results.flat();

          const enrichedEntries = await Promise.all(allEntriesForAccount.map(async (entry) => {
            let deptNum = getDepartmentNumberFromEntry(entry);
            if (deptNum !== null) return { ...entry, finalDepartmentNumber: deptNum };
            const invoiceSelf = entry.invoice?.self;
            if (invoiceSelf) {
              try {
                const invoicePath = new URL(invoiceSelf).pathname;
                const { data: invoiceData } = await supabase.functions.invoke("economic-api-proxy", { body: { path: invoicePath, method: "GET", country: currentCountry } });
                const fullInvoice = (invoiceData as any)?.data;
                deptNum = getDepartmentNumberFromEntry(fullInvoice);
                return { ...entry, finalDepartmentNumber: deptNum };
              } catch { return { ...entry, finalDepartmentNumber: null }; }
            }
            return { ...entry, finalDepartmentNumber: null };
          }));

          const filteredEntries = enrichedEntries.filter(entry => entry.finalDepartmentNumber === numericSku);
          return filteredEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
        };

        const baseDate = new Date(parseInt(selectedYear), parseInt(selectedMonth));
        const periodDates = Array.from({ length: numPeriods }, (_, i) => subMonths(baseDate, i));

        const periodResults = await Promise.all(
          periodDates.map(date => fetchAndProcessPeriod(date, selectedSku))
        );

        const assetPurchasesBalance = await fetchCumulativeBalance(6319, selectedSku);

        const periodMaps = periodResults.map(r => r.balanceMap);
        const allAccountNumbers = new Set(periodMaps.flatMap(map => Array.from(map.keys())));

        const lines: ReportLine[] = Array.from(allAccountNumbers).map(accountNumber => {
          const periodTotals = periodMaps.map(map => map.get(accountNumber)?.total || 0);
          const name = accountNameMap.get(accountNumber) || periodMaps.find(map => map.has(accountNumber))?.get(accountNumber)?.name || `Account ${accountNumber}`;
          return {
            accountNumber,
            name,
            periodTotals,
          };
        }).sort((a, b) => a.accountNumber - b.accountNumber);

        let revenueLines = lines.filter(l => l.accountNumber >= 910 && l.accountNumber <= 949);
        revenueLines = revenueLines.map(line => ({
          ...line,
          periodTotals: line.periodTotals.map(total => total * -1),
        }));

        const directCostsLines = lines.filter(l => l.accountNumber >= 950 && l.accountNumber <= 2974);
        const additionalCostsLines = lines.filter(l => l.accountNumber === 3057);

        const calculateSubtotals = (lines: ReportLine[]) => {
          const periodTotals = Array(numPeriods).fill(0);
          lines.forEach(line => {
            line.periodTotals.forEach((total: number, i: number) => {
              periodTotals[i] += total;
            });
          });
          return { periodTotals };
        };

        const revenueSubtotals = calculateSubtotals(revenueLines);
        const directCostsSubtotals = calculateSubtotals(directCostsLines);
        const additionalCostsSubtotals = calculateSubtotals(additionalCostsLines);

        const profitLoss = {
          periodTotals: Array(numPeriods).fill(0).map((_, i) => revenueSubtotals.periodTotals[i] - directCostsSubtotals.periodTotals[i]),
        };

        dismissToast(toastId);
        showSuccess("Report generated successfully.");
        return {
          revenueLines,
          directCostsLines,
          additionalCostsLines,
          revenueSubtotals,
          directCostsSubtotals,
          additionalCostsSubtotals,
          profitLoss,
          assetPurchasesBalance,
          periodHeaders: periodDates.map(date => format(date, 'MMMM yyyy')),
          periodEntries: periodResults.map(r => r.filteredEntries),
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
    if (reportData) {
      const dataToExport: any[] = [];
  
      const createRow = (label: string, periodValues: (number | string)[]) => {
        const row: Record<string, any> = { 'Account': label };
        reportData.periodHeaders.forEach((header, index) => {
          row[header] = periodValues[index];
        });
        return row;
      };
  
      // Add a blank row helper
      const addBlankRow = () => dataToExport.push({ 'Account': '' });
  
      dataToExport.push({ 'Account': 'Revenue' });
      reportData.revenueLines.forEach(line => dataToExport.push(createRow(`${line.accountNumber} - ${line.name}`, line.periodTotals)));
      dataToExport.push(createRow('Revenue Subtotal', reportData.revenueSubtotals.periodTotals));
  
      addBlankRow();
  
      dataToExport.push({ 'Account': 'Direct Costs' });
      reportData.directCostsLines.forEach(line => dataToExport.push(createRow(`${line.accountNumber} - ${line.name}`, line.periodTotals)));
      dataToExport.push(createRow('Direct Costs Subtotal', reportData.directCostsSubtotals.periodTotals));
  
      addBlankRow();
  
      dataToExport.push(createRow('Property Profit/Loss', reportData.profitLoss.periodTotals));
  
      addBlankRow();
  
      dataToExport.push({ 'Account': 'Additional Costs' });
      reportData.additionalCostsLines.forEach(line => dataToExport.push(createRow(`${line.accountNumber} - ${line.name}`, line.periodTotals)));
      dataToExport.push(createRow('Additional Costs Subtotal', reportData.additionalCostsSubtotals.periodTotals));
  
      addBlankRow();
  
      const assetValues = [reportData.assetPurchasesBalance, ...Array(reportData.periodHeaders.length - 1).fill('')];
      dataToExport.push(createRow('Asset Purchases (6319)', assetValues));
  
      // Define the column order explicitly to ensure consistency
      const columnOrder = ['Account', ...reportData.periodHeaders];
  
      exportToCsv(dataToExport, `p&l_report_${selectedSku}_${format(new Date(), 'yyyyMMdd')}.csv`, columnOrder);
    }
  };

  const handleViewDetails = (accountNumber: number, periodIndex: number) => {
    if (!reportData) return;
    const periodEntries = reportData.periodEntries[periodIndex];
    const accountEntries = periodEntries.filter(e => e.account?.accountNumber === accountNumber);
    setDialogData(accountEntries);
    setDialogTitle(`Transactions for Account ${accountNumber} - ${reportData.periodHeaders[periodIndex]}`);
    setIsDetailDialogOpen(true);
  };

  const handleViewTotalDetails = (periodIndex: number, section: 'revenue' | 'costs' | 'all' | 'additional') => {
    if (!reportData) return;
    const periodEntries = reportData.periodEntries[periodIndex];
    let entriesToShow = periodEntries;
    let title = `All Transactions for ${reportData.periodHeaders[periodIndex]}`;

    if (section === 'revenue') {
      entriesToShow = periodEntries.filter(e => e.account?.accountNumber >= 910 && e.account?.accountNumber <= 949);
      title = `Revenue Transactions for ${reportData.periodHeaders[periodIndex]}`;
    } else if (section === 'costs') {
      entriesToShow = periodEntries.filter(e => e.account?.accountNumber >= 950 && e.account?.accountNumber <= 2974);
      title = `Direct Costs Transactions for ${reportData.periodHeaders[periodIndex]}`;
    } else if (section === 'additional') {
      entriesToShow = periodEntries.filter(e => e.account?.accountNumber === 3057);
      title = `Additional Costs Transactions for ${reportData.periodHeaders[periodIndex]}`;
    }

    setDialogData(entriesToShow);
    setDialogTitle(title);
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

  if (!session) {
    navigate('/login');
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
            Generate a Profit & Loss report for a specific property, comparing the selected month with previous months.
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
              <div className="flex-1 min-w-[120px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Periods</label>
                <Select value={String(numPeriods)} onValueChange={(val) => setNumPeriods(Number(val))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => i + 3).map(p => (
                      <SelectItem key={p} value={String(p)}>{p}</SelectItem>
                    ))}
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
                      {isLoading ? (
                        <TableBody>
                          {Array.from({ length: 10 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={4}><Skeleton className="h-6 w-full" /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      ) : (
                        <>
                          <tbody className="border-2 border-dyad-blue rounded-lg">
                            <TableRow className="bg-dyad-blue text-dyad-blue-foreground font-bold hover:bg-dyad-blue">
                              <TableCell colSpan={1 + numPeriods}>Revenue</TableCell>
                            </TableRow>
                            {reportData.revenueLines.map((line) => (
                              <TableRow key={line.accountNumber}>
                                <TableCell className="font-medium pl-6">{line.accountNumber} - {line.name}</TableCell>
                                {line.periodTotals.map((total, index) => (
                                  <TableCell key={index} className="text-right"><Button variant="link" onClick={() => handleViewDetails(line.accountNumber, index)}>{formatAmount(total)}</Button></TableCell>
                                ))}
                              </TableRow>
                            ))}
                            <TableRow className="font-bold bg-dyad-blue/10 hover:bg-dyad-blue/20">
                              <TableCell className="pl-6">Revenue Subtotal</TableCell>
                              {reportData.revenueSubtotals.periodTotals.map((total, index) => (
                                <TableCell key={index} className="text-right"><Button variant="link" onClick={() => handleViewTotalDetails(index, 'revenue')}>{formatAmount(total)}</Button></TableCell>
                              ))}
                            </TableRow>

                            <TableRow className="bg-dyad-blue text-dyad-blue-foreground font-bold hover:bg-dyad-blue border-t-2 border-dyad-blue">
                              <TableCell colSpan={1 + numPeriods}>Direct Costs</TableCell>
                            </TableRow>
                            {reportData.directCostsLines.map((line) => (
                              <TableRow key={line.accountNumber}>
                                <TableCell className="font-medium pl-6">{line.accountNumber} - {line.name}</TableCell>
                                {line.periodTotals.map((total, index) => (
                                  <TableCell key={index} className="text-right"><Button variant="link" onClick={() => handleViewDetails(line.accountNumber, index)}>{formatAmount(total)}</Button></TableCell>
                                ))}
                              </TableRow>
                            ))}
                            <TableRow className="font-bold bg-dyad-blue/10 hover:bg-dyad-blue/20">
                              <TableCell className="pl-6">Direct Costs Subtotal</TableCell>
                              {reportData.directCostsSubtotals.periodTotals.map((total, index) => (
                                <TableCell key={index} className="text-right"><Button variant="link" onClick={() => handleViewTotalDetails(index, 'costs')}>{formatAmount(total)}</Button></TableCell>
                              ))}
                            </TableRow>

                            <TableRow className="font-extrabold bg-dyad-blue-light text-dyad-blue-foreground border-t-2 border-dyad-blue hover:bg-dyad-blue-light">
                              <TableCell>Property Profit/Loss</TableCell>
                              {reportData.profitLoss.periodTotals.map((total, index) => (
                                <TableCell key={index} className="text-right">{formatAmount(total)}</TableCell>
                              ))}
                            </TableRow>
                          </tbody>

                          <tbody>
                            <TableRow>
                              <TableCell colSpan={1 + numPeriods} className="py-4"></TableCell>
                            </TableRow>
                          </tbody>

                          <tbody className="border-2 border-gray-300 rounded-lg">
                            <TableRow className="bg-gray-200 font-bold text-gray-800 hover:bg-gray-200">
                              <TableCell colSpan={1 + numPeriods}>Additional Costs</TableCell>
                            </TableRow>
                            {reportData.additionalCostsLines.map((line) => (
                              <TableRow key={line.accountNumber}>
                                <TableCell className="font-medium pl-6">{line.accountNumber} - {line.name}</TableCell>
                                {line.periodTotals.map((total, index) => (
                                  <TableCell key={index} className="text-right"><Button variant="link" onClick={() => handleViewDetails(line.accountNumber, index)}>{formatAmount(total)}</Button></TableCell>
                                ))}
                              </TableRow>
                            ))}
                            <TableRow className="font-bold bg-gray-100 text-gray-800 hover:bg-gray-100">
                              <TableCell className="pl-6">Additional Costs Subtotal</TableCell>
                              {reportData.additionalCostsSubtotals.periodTotals.map((total, index) => (
                                <TableCell key={index} className="text-right"><Button variant="link" onClick={() => handleViewTotalDetails(index, 'additional')}>{formatAmount(total)}</Button></TableCell>
                              ))}
                            </TableRow>

                            <TableRow className="bg-gray-100 text-gray-800 hover:bg-gray-100">
                              <TableCell>Asset Purchases (6319)</TableCell>
                              <TableCell className="text-right" colSpan={numPeriods}>{formatAmount(reportData.assetPurchasesBalance)}</TableCell>
                            </TableRow>
                          </tbody>
                        </>
                      )}
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