"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { PaymentRequest } from '@/types/supabase';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Home, Search, RotateCw, AlertTriangle, Database } from 'lucide-react';
import { showError, showLoading, dismissToast, showSuccess, showInfo } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import EconomicDetailDialog, { DialogColumn, extractList, formatAmount } from '@/components/economic/EconomicDetailDialog';
import { useDepartments } from '@/hooks/useDepartments';

import { Input } from '@/components/ui/input';
import CountrySelector from '@/components/CountrySelector';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import DepositReturnForm from '@/components/deposits/DepositReturnForm';

// Define the Customer Deposit Account Number
const CUSTOMER_DEPOSIT_ACCOUNT_NUMBER = 8201;

// Types
type EconomicLedgerEntry = {
  entryNumber: number;
  entryType: string;
  text: string;
  amount: number;
  currency: string;
  remainder: number;
  date: string;
  customer: {
    customerNumber: number;
    name: string;
  };
  self: string;
  departmentalDistribution?: {
    departmentalDistributionNumber?: number;
    self?: string;
  };
  department?: {
    departmentNumber?: number;
  };
  departmentNumber?: number;
  [key: string]: any;
};

type CustomerGroup = {
  customer: {
    customerNumber: number;
    name: string;
  };
  entries: EconomicLedgerEntry[];
  balance: number;
  currency: string;
};

const CustomerDeposits = () => {
  const { session, isLoading: isSessionLoading, userProfile, user } = useSession();
  const { currentCountry, setCurrentCountry, isCountryLocked, availableCountries } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [departmentSearchTerm, setDepartmentSearchTerm] = useState('');
  const [debouncedFilterTerm, setDebouncedFilterTerm] = useState('');
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [dialogData, setDialogData] = useState<EconomicLedgerEntry[] | null>(null);
  const [dialogTitle, setDialogTitle] = useState('');
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [advisingCustomer, setAdvisingCustomer] = useState<CustomerGroup | null>(null);
  const [showRawDataDialog, setShowRawDataDialog] = useState(false);
  const [refreshResult, setRefreshResult] = useState<any>(null);
  const [isRefreshResultDialogOpen, setIsRefreshResultDialogOpen] = useState(false);

  const isAdmin = userProfile?.role === 'admin';

  const { data: departments, isLoading: isLoadingDepartments } = useDepartments(currentCountry);

  const departmentMap = useMemo(() => {
    if (!departments) return new Map<number, string>();
    return new Map(departments.map(d => [d.departmentNumber, d.name]));
  }, [departments]);

  const { data: cacheData, isLoading: isLoadingCache, refetch: refetchCache } = useQuery<{ entries: EconomicLedgerEntry[], cached_at: string } | null>({
    queryKey: ['customerDepositCache', currentCountry],
    queryFn: async () => {
        if (!session || currentCountry === 'all') return null;
        const { data, error } = await supabase
            .from('customer_deposit_cache')
            .select('entries, cached_at')
            .eq('country', currentCountry)
            .limit(1)
            .single();
        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            throw error;
        }
        return data;
    },
    enabled: !!session && currentCountry !== 'all',
  });

  const allAccountEntries = cacheData?.entries;
  const lastCachedAt = cacheData?.cached_at;

  const refreshCacheMutation = useMutation({
      mutationFn: async () => {
          const { data, error } = await supabase.functions.invoke('fetch-customer-deposit-cache', {
              body: { country: currentCountry },
          });
          if (error) throw error;
          return data;
      },
      onSuccess: (data) => {
          setRefreshResult(data);
          setIsRefreshResultDialogOpen(true);
          if (data?.error) {
              showError(data.error);
          } else {
              showSuccess("Cache refresh initiated. Data will update shortly.");
          }
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['customerDepositCache', currentCountry] });
          }, 5000);
      },
      onError: (error: any) => {
          setRefreshResult({ error: error.message });
          setIsRefreshResultDialogOpen(true);
          showError(error.message || "Failed to start cache refresh.");
      }
  });

  const groupedByCustomer = useMemo(() => {
    if (!allAccountEntries) return [];
    let entries = [...allAccountEntries];
    if (debouncedFilterTerm) {
      const numericTerm = parseInt(debouncedFilterTerm, 10);
      if (!isNaN(numericTerm)) {
        entries = entries.filter(entry => {
          let deptNum: number | null = null;

          // Primary check for the direct number
          if (entry?.departmentalDistribution?.departmentalDistributionNumber) {
            deptNum = entry.departmentalDistribution.departmentalDistributionNumber;
          } 
          // Fallback checks for other common structures
          else if (entry?.department?.departmentNumber) {
            deptNum = entry.department.departmentNumber;
          } else if (entry?.departmentNumber) {
            deptNum = entry.departmentNumber;
          } 
          // Fallback to parse the 'self' URL, as identified by the user
          else if (entry?.departmentalDistribution?.self) {
            const selfUrl = entry.departmentalDistribution.self;
            const match = selfUrl.match(/\/(\d+)$/); // Regex to get the number at the end of the URL
            if (match && match[1]) {
              deptNum = parseInt(match[1], 10);
            }
          }
  
          return deptNum === numericTerm;
        });
      }
    }
    const customerGroups: Record<number, CustomerGroup> = {};
    entries.forEach(entry => {
      const customerNumber = entry?.customer?.customerNumber;
      if (customerNumber) {
        if (!customerGroups[customerNumber]) {
          customerGroups[customerNumber] = {
            customer: { customerNumber, name: entry.customer.name || `Customer #${customerNumber}` },
            entries: [],
            balance: 0,
            currency: entry.currency || '',
          };
        }
        customerGroups[customerNumber].entries.push(entry);
        customerGroups[customerNumber].balance += parseFloat(String(entry.amount)) || 0;
      }
    });
    return Object.values(customerGroups);
  }, [allAccountEntries, debouncedFilterTerm]);

  const adviseDepositReturnMutation = useMutation({
    mutationFn: async (values: Omit<PaymentRequest, 'id' | 'created_at' | 'updated_at' | 'requester_id'> & { requester_id: string }) => {
      const { error } = await supabase.from('payment_requests').insert(values);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      showSuccess("Deposit return request created successfully!");
      setAdvisingCustomer(null);
      queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] });
    },
    onError: (error: any) => {
      showError(error.message || "Failed to submit advice.");
    },
  });

  const handleAdviseSubmit = async (values: any) => {
    if (!user || !advisingCustomer) return;
    await adviseDepositReturnMutation.mutateAsync({
      requester_id: user.id,
      supplier_name: advisingCustomer.customer.name,
      supplier_address: 'N/A',
      currency: advisingCustomer.currency,
      total_amount: Math.abs(advisingCustomer.balance),
      reason_for_payment: `Deposit Return for Customer #${advisingCustomer.customer.customerNumber} / SKU ${debouncedFilterTerm}`,
      date_payment_required: new Date().toISOString().split('T')[0],
      status: 'pending',
      country: values.country,
      is_deposit_return: true,
      not_sku_related: false,
      sku_number: debouncedFilterTerm,
      categories: [{ category: '8201_customer_deposit', amount: Math.abs(advisingCustomer.balance) }],
      invoice_pdf_urls: [],
      bank_details_verified: values.bank_details_verified,
      bank_account_name: values.bank_account_name,
      iban_number: values.iban_number,
      sort_code: null,
      account_number: null,
      lease_id: null,
      admin_action_by: null,
      admin_action_reason: null,
      receipt_pdf_url: null,
      payment_setup_date: null,
      payment_approved_date: null,
      receipt_required: false,
      is_urgent: false,
      last_reminder_sent_at: null,
      is_reminded: false,
    });
  };

  const handleSearch = () => {
    setSearchPerformed(true);
    const term = departmentSearchTerm.trim();
    if (term.length > 0) {
      const numericTerm = term.replace(/^(CH|UK)/i, '');
      if (/^\d+$/.test(numericTerm)) {
        setDebouncedFilterTerm(numericTerm);
      } else {
        showError("Please enter a valid numeric property identifier (SKU).");
        setDebouncedFilterTerm('');
      }
    } else {
      setDebouncedFilterTerm('');
    }
  };

  const ledgerColumns: DialogColumn[] = [
    { key: 'date', header: 'Date', format: 'date', path: ['date', 'entryDate'] },
    { key: 'entryNumber', header: 'Entry No.', path: ['entryNumber', 'number', 'id'] },
    { key: 'entryType', header: 'Entry Type', path: ['entryType', 'type'] },
    { key: 'text', header: 'Text', path: ['text', 'description'] },
    { key: 'amount', header: 'Amount', format: 'currencyAmount', path: ['amount'] },
    { key: 'currency', header: 'Currency', path: ['currency'] },
  ];

  if (isSessionLoading) return <div className="flex items-center justify-center h-full text-lg">Loading...</div>;
  if (!session) { navigate("/login"); return null; }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Customer Deposits - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <Home className="mr-2 h-6 w-6" /> Customer Deposits
          </CardTitle>
          <CardDescription>View customer deposit entries from e-conomic for account 8201, filtered by property SKU.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4 p-4 border rounded-md bg-gray-50 shadow-sm">
              <div className="flex-1 min-w-[200px]">
                <label htmlFor="country-filter" className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <CountrySelector value={currentCountry} onValueChange={setCurrentCountry} disabled={isCountryLocked && !isAdmin} availableCountries={availableCountries.filter(c => c.value !== 'all')} />
              </div>
              <div className="flex-1 min-w-[250px]">
                <label htmlFor="department-search" className="block text-sm font-medium text-gray-700 mb-1">Property Identifier / SKU (Numeric Only)</label>
                <Input id="department-search" placeholder="e.g., 12345" value={departmentSearchTerm} onChange={(e) => setDepartmentSearchTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }} className="w-full" />
              </div>
              <Button onClick={handleSearch} disabled={isLoadingCache || currentCountry === 'all'} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm">
                <Search className="mr-2 h-4 w-4" /> {isLoadingCache ? "Searching..." : "Search Entries"}
              </Button>
              {debouncedFilterTerm.length > 0 && (
                <Button variant="outline" onClick={() => { setDepartmentSearchTerm(''); setDebouncedFilterTerm(''); setSearchPerformed(false); }} className="flex items-center gap-1">
                  <RotateCw className="h-4 w-4" /> Clear Search
                </Button>
              )}
            </div>
            {isAdmin && (
              <div className="flex items-center justify-end gap-4">
                {lastCachedAt && <p className="text-sm text-muted-foreground">Last updated: {format(new Date(lastCachedAt), 'PPP p')}</p>}
                <Button variant="outline" onClick={() => setShowRawDataDialog(true)} disabled={!allAccountEntries}>
                  <Database className="mr-2 h-4 w-4" /> View Raw Data
                </Button>
                <Button onClick={() => refreshCacheMutation.mutate()} disabled={refreshCacheMutation.isPending || currentCountry === 'all'}>
                  <RotateCw className={`mr-2 h-4 w-4 ${refreshCacheMutation.isPending ? 'animate-spin' : ''}`} />
                  Refresh Cache
                </Button>
              </div>
            )}
            {currentCountry === 'all' && isAdmin ? (
              <Alert><AlertTitle>Please Select a Country</AlertTitle><AlertDescription>To view customer deposits, please select a specific country.</AlertDescription></Alert>
            ) : isLoadingCache || isLoadingDepartments ? (
              <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : !searchPerformed ? (
              <p className="text-center text-muted-foreground mt-8">Please enter a property identifier (SKU) to begin.</p>
            ) : groupedByCustomer.length > 0 ? (
              <Table>
                <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Customer Number</TableHead><TableHead className="text-right">Deposit Balance</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {groupedByCustomer.map((group) => (
                    <TableRow key={group.customer.customerNumber}>
                      <TableCell className="font-medium">{group.customer.name}</TableCell>
                      <TableCell>{group.customer.customerNumber}</TableCell>
                      <TableCell className="text-right font-semibold">{formatAmount(group.balance)} {group.currency}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => { setDialogData(group.entries); setDialogTitle(`Transactions for ${group.customer.name}`); setShowDetailDialog(true); }}>View Transactions</Button>
                        {group.balance < 0 && (
                          <Button variant="destructive" size="sm" onClick={() => setAdvisingCustomer(group)}>Advise Deposit Return</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground mt-8">No customer deposits found for SKU "{debouncedFilterTerm}".</p>
            )}
          </div>
        </CardContent>
      </Card>
      <EconomicDetailDialog isOpen={showDetailDialog} onOpenChange={setShowDetailDialog} title={dialogTitle} data={dialogData} columns={ledgerColumns} isLoading={false} defaultSort={{ key: 'date', direction: 'descending' }} />
      {advisingCustomer && (
        <Dialog open={!!advisingCustomer} onOpenChange={() => setAdvisingCustomer(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Advise Deposit Return</DialogTitle>
              <DialogDescription>Create a payment request to return the deposit to {advisingCustomer.customer.name}.</DialogDescription>
            </DialogHeader>
            <DepositReturnForm
              customerName={advisingCustomer.customer.name}
              returnAmount={Math.abs(advisingCustomer.balance)}
              currency={advisingCustomer.currency}
              onSubmit={handleAdviseSubmit}
              isSubmitting={adviseDepositReturnMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
      <Dialog open={showRawDataDialog} onOpenChange={setShowRawDataDialog}>
        <DialogContent className="sm:max-w-[80%] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Raw Cache Data for {currentCountry}</DialogTitle>
            <DialogDescription>
              This is the raw JSON data fetched from the cache table. Last updated: {lastCachedAt ? format(new Date(lastCachedAt), 'PPP p') : 'N/A'}.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh] bg-gray-100 p-4 rounded">
            <pre className="text-xs whitespace-pre-wrap">
              {JSON.stringify(allAccountEntries, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isRefreshResultDialogOpen} onOpenChange={setIsRefreshResultDialogOpen}>
        <DialogContent className="sm:max-w-[80%] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Cache Refresh Result</DialogTitle>
            <DialogDescription>
              This is the raw response from the cache refresh process.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh] bg-gray-100 p-4 rounded">
            <pre className="text-xs whitespace-pre-wrap">
              {JSON.stringify(refreshResult, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerDeposits;