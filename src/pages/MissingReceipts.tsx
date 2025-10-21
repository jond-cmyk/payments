"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Transaction, Profile } from '@/types/supabase';
import { format } from 'date-fns';
import { FileText, CheckCircle, Clock, XCircle, FileX, Trash2, UserPlus, Filter, RotateCcw, ArrowUp, ArrowDown, FileDown } from 'lucide-react';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { exportToCsv } from '@/utils/exportToCsv';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import DatePicker from '@/components/DatePicker';
import { cn } from '@/lib/utils';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import CountrySelector from '@/components/CountrySelector'; // <--- ADDED THIS IMPORT

const ITEMS_PER_PAGE = 10;

const MissingReceipts = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);

  // Filter states (debounced for query)
  const [filterAmount, setFilterAmount] = useState<string>('');
  const [filterAssignedUser, setFilterAssignedUser] = useState<string>('all');
  const [filterTransactionDate, setFilterTransactionDate] = useState<Date | undefined>(undefined);
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(undefined);
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(undefined);

  // Local states for immediate input feedback
  const [localFilterAmount, setLocalFilterAmount] = useState<string>('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(ITEMS_PER_PAGE);

  // Sorting states
  const [sortColumn, setSortColumn] = useState<keyof Transaction | null>('transaction_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Debounce for text inputs
  const debounceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextFilterChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      console.log(`[MissingReceipts] Debounced filter update for: ${value}`);
      setter(value);
      setCurrentPage(1);
    }, 700); // Increased debounce time to 700ms
  }, []);

  // Effect to sync local filter states with actual filter states when they are cleared externally
  useEffect(() => {
    setLocalFilterAmount(filterAmount);
  }, [filterAmount]);

  const isAdmin = userProfile?.role === 'admin';

  // Fetch ALL transactions that are pending input and have no receipts
  const { data: transactions, isLoading: isTransactionsLoading, error: transactionsError } = useQuery<Transaction[]>({
    queryKey: ['missingReceipts', filterAmount, filterAssignedUser, filterTransactionDate, filterStartDate, filterEndDate, sortColumn, sortDirection, currentCountry, currentPage, itemsPerPage],
    queryFn: async () => {
      if (!session) return [];

      console.log(`[MissingReceipts Query] Fetching with filters: amount=${filterAmount}, assignedUser=${filterAssignedUser}, date=${filterTransactionDate?.toISOString().split('T')[0]}, startDate=${filterStartDate?.toISOString().split('T')[0]}, endDate=${filterEndDate?.toISOString().split('T')[0]}, sortColumn=${String(sortColumn)}, sortDirection=${sortDirection}, country=${currentCountry}, currentPage=${currentPage}`);

      const from = itemsPerPage === 'all' ? 0 : (currentPage - 1) * (itemsPerPage as number);
      const to = itemsPerPage === 'all' ? null : from + (itemsPerPage as number) - 1;

      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('status', 'pending_input')
        .eq('receipt_urls', '{}');
        
      // Apply country filter based on user role and selected country
      if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      // Apply dynamic sorting
      if (sortColumn) {
        query = query.order(String(sortColumn), { ascending: sortDirection === 'asc' });
      }
      if (sortColumn !== 'created_at') {
        query = query.order('created_at', { ascending: false });
      }
      if (sortColumn !== 'id') {
        query = query.order('id', { ascending: false });
      }

      // Apply filters
      if (filterAssignedUser !== 'all') {
        query = query.eq('requester_id', filterAssignedUser);
      }

      if (filterAmount) {
        const amountNum = parseFloat(filterAmount);
        if (!isNaN(amountNum)) {
          query = query.eq('amount', amountNum);
        }
      }

      if (filterTransactionDate) {
        query = query.eq('transaction_date', format(filterTransactionDate, 'yyyy-MM-dd'));
      }
      // NEW: Apply date range filters
      if (filterStartDate) {
        query = query.gte('transaction_date', format(filterStartDate, 'yyyy-MM-dd'));
      }
      if (filterEndDate) {
        query = query.lte('transaction_date', format(filterEndDate, 'yyyy-MM-dd'));
      }

      if (itemsPerPage !== 'all') {
        query = query.range(from, to);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setTotalItems(count || 0);
      console.log(`[MissingReceipts Query] Fetched ${data?.length || 0} transactions. Total count: ${count}. First transaction: ${JSON.stringify(data?.[0])}`);
      return data;
    },
    enabled: !!session,
  });

  // Fetch all user profiles for the assignee dropdown
  const { data: allProfiles, isLoading: isProfilesLoading, error: profilesError } = useQuery<Profile[]>({
    queryKey: ['allProfilesForAssignment', currentCountry],
    queryFn: async () => {
      let query = supabase
        .from('profile_with_email')
        .select('id, first_name, last_name, user_email, role, is_approved, avatar_url, updated_at, country');
      
      if (currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) throw new Error("No transactions selected for deletion.");
      let query = supabase
        .from('transactions')
        .delete()
        .in('id', ids);
      
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { error } = await query;
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missingReceipts'] });
      setSelectedTransactionIds([]);
      showSuccess("Selected transactions deleted successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete selected transactions.");
      console.error("Bulk delete error:", error);
    },
  });

  const assignTransactionMutation = useMutation({
    mutationFn: async ({ transactionId, newRequesterId }: { transactionId: string; newRequesterId: string }) => {
      let query = supabase
        .from('transactions')
        .update({ requester_id: newRequesterId, updated_at: new Date().toISOString() })
        .eq('id', transactionId);
      
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { error } = await query;
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      console.log("Transaction reassigned successfully. Invalidating 'missingReceipts' query.");
      console.log("Current filterAssignedUser:", filterAssignedUser);
      queryClient.invalidateQueries({ queryKey: ['missingReceipts'] });
      queryClient.invalidateQueries({ queryKey: ['transactionAudits'] });
      showSuccess("Transaction reassigned successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to reassign transaction.");
      console.error("Reassign transaction error:", error);
    },
  });

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const allIds = transactions?.map(t => t.id) || [];
      setSelectedTransactionIds(allIds);
    } else {
      setSelectedTransactionIds([]);
    }
  }, [transactions]);

  const handleSelectTransaction = useCallback((id: string, checked: boolean) => {
    setSelectedTransactionIds(prev =>
      checked ? [...prev, id] : prev.filter(prevId => prevId !== id)
    );
  }, []);

  const handleDeleteSelected = async () => {
    const toastId = showLoading("Deleting selected transactions...");
    try {
      await bulkDeleteMutation.mutateAsync(selectedTransactionIds);
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };

  const handleAssignTransaction = async (transactionId: string, newRequesterId: string) => {
    const toastId = showLoading("Reassigning transaction...");
    try {
      await assignTransactionMutation.mutateAsync({ transactionId, newRequesterId });
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };

  const handleSort = (column: keyof Transaction) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const renderSortIcon = (column: keyof Transaction) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
    }
    return null;
  };

  const clearFilters = () => {
    setFilterAmount('');
    setLocalFilterAmount('');
    setFilterAssignedUser('all');
    setFilterTransactionDate(undefined);
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setCurrentPage(1);
    queryClient.invalidateQueries({ queryKey: ['missingReceipts'] });
  };

  const hasActiveFilters = filterAmount !== '' || filterAssignedUser !== 'all' || filterTransactionDate !== undefined || filterStartDate !== undefined || filterEndDate !== undefined;

  // Define columns for Transaction export
  const transactionExportColumns: (keyof Transaction)[] = [
    'id', 'created_at', 'updated_at', 'requester_id', 'uploaded_by_user_id',
    'original_transaction_id', 'status', 'type', 'transaction_date', 'entry',
    'description', 'amount', 'bank', 'contra_account', 'currency',
    'exchange_rate', 'comment', 'sku', 'reason_for_payment', 'receipt_urls',
    'category', 'merchant_name', 'notes', 'not_sku_related', 'country'
  ];

  const handleDownloadTransactions = () => {
    if (transactions) {
      exportToCsv(transactions, `missing_receipts_${currentCountry}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`, transactionExportColumns);
    }
  };

  const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(totalItems / (itemsPerPage as number));

  const renderPaginationItems = () => {
    const items = [];
    const maxPagesToShow = 5;
    const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (startPage > 1) {
      items.push(
        <PaginationItem key="1">
          <PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink>
        </PaginationItem>
      );
      if (startPage > 2) {
        items.push(<PaginationItem key="ellipsis-start"><PaginationEllipsis /></PaginationItem>);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink isActive={i === currentPage} onClick={() => setCurrentPage(i)}>
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        items.push(<PaginationItem key="ellipsis-end"><PaginationEllipsis /></PaginationItem>);
      }
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => setCurrentPage(totalPages)}>{totalPages}</PaginationLink>
        </PaginationItem>
      );
    }

    return items;
  };

  if (isSessionLoading || isTransactionsLoading || isProfilesLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading missing receipts...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (transactionsError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading missing receipts: {transactionsError.message}</div>;
  }

  if (profilesError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading user profiles: {profilesError.message}</div>;
  }

  const getStatusBadge = (status: Transaction['status']) => {
    let className = '';
    let icon = null;
    switch (status) {
      case 'pending_input':
        className = 'bg-yellow-500 text-yellow-50';
        icon = <Clock className="mr-1 h-3 w-3" />;
        break;
      case 'completed':
        className = 'bg-blue-500 text-blue-50';
        icon = <CheckCircle className="mr-1 h-3 w-3" />;
        break;
      case 'approved':
        className = 'bg-green-500 text-green-50';
        icon = <CheckCircle className="mr-1 h-3 w-3" />;
        break;
      case 'declined':
        className = 'bg-red-500 text-red-50';
        icon = <XCircle className="mr-1 h-3 w-3" />;
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return (
      <Badge className={cn(className)}>
        {icon} {status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.replace(/_/g, ' ').slice(1)}
      </Badge>
    );
  };

  const allTransactionsSelected = transactions && transactions.length > 0 && selectedTransactionIds.length === transactions.length;

  return (
    <div className="container mx-auto py-8">
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center text-2xl font-bold">
              <FileX className="mr-2 h-6 w-6" /> Missing Receipts
            </CardTitle>
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 gap-2">
              {isAdmin && (
                <Button onClick={handleDownloadTransactions} className="shadow-sm" variant="outline">
                  <FileDown className="mr-2 h-4 w-4" /> Download to Excel
                </Button>
              )}
              <div className="flex items-center gap-2">
                <label htmlFor="items-per-page" className="text-sm font-medium text-gray-700">
                  Records per page:
                </label>
                <Select
                  value={String(itemsPerPage)}
                  onValueChange={(value) => {
                    const newItemsPerPage = value === 'all' ? 'all' : parseInt(value);
                    setItemsPerPage(newItemsPerPage);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger id="items-per-page" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="all">Show All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && selectedTransactionIds.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={bulkDeleteMutation.isPending} className="shadow-sm">
                      <Trash2 className="mr-2 h-4 w-4" /> Delete Selected ({selectedTransactionIds.length})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete {selectedTransactionIds.length} selected transactions and all associated data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteSelected} asChild>
                        <Button variant="destructive">
                          Delete
                        </Button>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 p-4 border rounded-md bg-gray-50 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Filter Missing Receipts</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div>
                <label htmlFor="country-selector" className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <CountrySelector className="w-full" triggerClassName="w-full" />
              </div>
              <div>
                <label htmlFor="amount-filter" className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <Input
                  id="amount-filter"
                  placeholder="e.g., 100.00"
                  type="number"
                  step="0.01"
                  value={localFilterAmount}
                  onChange={(e) => {
                    setLocalFilterAmount(e.target.value);
                    handleTextFilterChange(setFilterAmount, e.target.value);
                  }}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="assigned-user-filter" className="block text-sm font-medium text-gray-700 mb-1">Assigned User</label>
                <Select value={filterAssignedUser} onValueChange={(value) => { setFilterAssignedUser(value); setCurrentPage(1); }}>
                  <SelectTrigger id="assigned-user-filter" className="w-full">
                    <SelectValue placeholder="All Users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {allProfiles?.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        <span>{profile.first_name || ''} {profile.last_name || ''} ({profile.user_email})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="transaction-date-filter" className="block text-sm font-medium text-gray-700 mb-1">Transaction Date</label>
                <DatePicker
                  id="transaction-date-filter"
                  date={filterTransactionDate}
                  setDate={(date) => { setFilterTransactionDate(date); setCurrentPage(1); }}
                  placeholder="Select Date"
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <DatePicker
                  id="start-date"
                  date={filterStartDate}
                  setDate={(date) => { setFilterStartDate(date); setCurrentPage(1); }}
                  placeholder="Select Start Date"
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <DatePicker
                  id="end-date"
                  date={filterEndDate}
                  setDate={(date) => { setFilterEndDate(date); setCurrentPage(1); }}
                  placeholder="Select End Date"
                  className="w-full"
                />
              </div>
              {hasActiveFilters && (
                <div className="col-span-full flex justify-end">
                  <Button variant="outline" onClick={clearFilters} className="flex items-center gap-1">
                    <RotateCcw className="h-4 w-4" /> Clear Filters
                  </Button>
                </div>
              )}
            </div>
          </div>

          {transactions && transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={allTransactionsSelected}
                          onCheckedChange={handleSelectAll}
                          aria-label="Select all transactions"
                        />
                      </TableHead>
                    )}
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('transaction_date')}>
                      <div className="flex items-center">
                        Date {renderSortIcon('transaction_date')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('description')}>
                      <div className="flex items-center">
                        Description {renderSortIcon('description')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('amount')}>
                      <div className="flex items-center">
                        Amount {renderSortIcon('amount')}
                      </div>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('sku')}>
                      <div className="flex items-center">
                        SKU {renderSortIcon('sku')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('reason_for_payment')}>
                      <div className="flex items-center">
                        Reason for Payment {renderSortIcon('reason_for_payment')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('requester_id')}>
                      <div className="flex items-center">
                        Assigned To {renderSortIcon('requester_id')}
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id} className="hover:bg-gradient-to-r hover:from-dyad-blue-light/5 hover:to-background">
                      {isAdmin && (
                        <TableCell>
                          <Checkbox
                            checked={selectedTransactionIds.includes(transaction.id)}
                            onCheckedChange={(checked: boolean) => handleSelectTransaction(transaction.id, checked)}
                            aria-label={`Select transaction ${transaction.id.substring(0, 8)}`}
                          />
                        </TableCell>
                      )}
                      <TableCell>{format(new Date(transaction.transaction_date), 'PPP')}</TableCell>
                      <TableCell className="font-medium">{transaction.description}</TableCell>
                      <TableCell>{transaction.currency} {transaction.amount.toFixed(2)}</TableCell>
                      <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                      <TableCell>{transaction.sku || 'N/A'}</TableCell>
                      <TableCell>{transaction.reason_for_payment || 'N/A'}</TableCell>
                      <TableCell>
                        <Select
                          value={transaction.requester_id || ''}
                          onValueChange={(newRequesterId) => handleAssignTransaction(transaction.id, newRequesterId)}
                          disabled={assignTransactionMutation.isPending}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Assign User" />
                          </SelectTrigger>
                          <SelectContent>
                            {allProfiles?.map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                <span>{profile.first_name || ''} {profile.last_name || ''} ({profile.user_email})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="shadow-sm"
                          onClick={() => navigate(`/transaction/${transaction.id}`)}
                        >
                          <span>View/Add Receipt</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground mt-8">No transactions with missing receipts found matching your criteria.</p>
          )}
          {totalPages > 1 && (
            <Pagination className="mt-4">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} />
                </PaginationItem>
                {renderPaginationItems()}
                <PaginationItem>
                  <PaginationNext onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MissingReceipts;