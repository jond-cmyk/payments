"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { DirectDebit, Profile } from '@/types/supabase';
import { format } from 'date-fns';
import { Banknote, PlusCircle, Filter, RotateCcw, ArrowUp, ArrowDown, Edit, Trash2, Eye, FileDown } from 'lucide-react';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';
import { exportToCsv } from '@/utils/exportToCsv';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DatePicker from '@/components/DatePicker';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import AddDirectDebitForm from '@/components/direct-debits/AddDirectDebitForm';
import EditDirectDebitForm from '@/components/direct-debits/EditDirectDebitForm';
import { cn } from '@/lib/utils';
import CountrySelector from '@/components/CountrySelector';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 10;

const DirectDebits = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddDirectDebitDialogOpen, setIsAddDirectDebitDialogOpen] = useState(false);
  const [isEditDirectDebitDialogOpen, setIsEditDirectDebitDialogOpen] = useState(false);
  const [editingDirectDebit, setEditingDirectDebit] = useState<DirectDebit | null>(null);

  // Filter states (debounced for query)
  const [filterPayee, setFilterPayee] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPaymentDate, setFilterPaymentDate] = useState<Date | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<DirectDebit['status'] | 'all'>('all');
  const [filterSku, setFilterSku] = useState<string>('');
  const [filterPaymentReference, setFilterPaymentReference] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(undefined);
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(undefined);

  // Local states for immediate input feedback
  const [localFilterPayee, setLocalFilterPayee] = useState<string>('');
  const [localFilterSku, setLocalFilterSku] = useState<string>('');
  const [localFilterPaymentReference, setLocalFilterPaymentReference] = useState<string>('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  // NEW: Page size selector with 'all' option
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(ITEMS_PER_PAGE);

  // NEW: Row selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toggleRowSelection = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id));
  }, []);

  // Fetch Direct Debits
  const { data: directDebits, isLoading: isDirectDebitsLoading, error: directDebitsError } = useQuery<DirectDebit[]>({
    // NEW: include itemsPerPage in query key
    queryKey: ['directDebits', currentCountry, filterPayee, filterCategory, filterPaymentDate, filterStatus, filterSku, filterPaymentReference, filterStartDate, filterEndDate, sortColumn, sortDirection, currentPage, itemsPerPage],
    queryFn: async () => {
      if (!session) return [];

      // NEW: Compute range only when not 'all'
      const from = itemsPerPage === 'all' ? 0 : (currentPage - 1) * (itemsPerPage as number);
      const to = itemsPerPage === 'all' ? null : from + (itemsPerPage as number) - 1;

      let query = supabase
        .from('direct_debits')
        .select('*', { count: 'exact' });

      // Apply country filter based on user role and selected country
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      // Apply filters
      if (filterPayee) {
        query = query.ilike('payee', `%${filterPayee}%`);
      }
      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory);
      }
      if (filterPaymentDate) {
        query = query.eq('payment_date', format(filterPaymentDate, 'yyyy-MM-dd'));
      }
      // NEW: Apply date range filters
      if (filterStartDate) {
        query = query.gte('payment_date', format(filterStartDate, 'yyyy-MM-dd'));
      }
      if (filterEndDate) {
        query = query.lte('payment_date', format(filterEndDate, 'yyyy-MM-dd'));
      }
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }
      if (filterSku) {
        query = query.ilike('sku', `%${filterSku}%`);
      }
      if (filterPaymentReference) {
        query = query.ilike('payment_reference', `%${filterPaymentReference}%`);
      }

      // Apply sorting
      if (sortColumn) {
        query = query.order(sortColumn, { ascending: sortDirection === 'asc' });
      }
      if (sortColumn !== 'created_at') {
        query = query.order('created_at', { ascending: false });
      }
      if (sortColumn !== 'id') {
        query = query.order('id', { ascending: false });
      }

      // NEW: Apply range only when not 'all'
      if (to !== null) {
        query = query.range(from, to);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setTotalItems(count || 0);
      return data;
    },
    enabled: !!session,
  });

  // Define functions after directDebits is available
  const toggleSelectAllVisible = (checked: boolean) => {
    if (!directDebits) return;
    const visibleIds = directDebits.map(d => d.id);
    setSelectedIds((prev) => checked ? Array.from(new Set([...prev, ...visibleIds])) : prev.filter((id) => !visibleIds.includes(id)));
  };

  // Calculate these values safely
  const visibleIds = directDebits?.map(d => d.id) ?? [];
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));

  // Effect to sync local filter states with actual filter states when they are cleared externally
  useEffect(() => {
    setLocalFilterPayee(filterPayee);
  }, [filterPayee]);

  useEffect(() => {
    setLocalFilterSku(filterSku);
  }, [filterSku]);

  useEffect(() => {
    setLocalFilterPaymentReference(filterPaymentReference);
  }, [filterPaymentReference]);

  // Sorting states
  const [sortColumn, setSortColumn] = useState<keyof DirectDebit | null>('payment_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Debounce for text inputs
  const debounceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextFilterChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      setter(value);
      setCurrentPage(1);
    }, 500);
  }, []);

  const isAdmin = userProfile?.role === 'admin';

  // NEW: Bulk delete mutation (admins only)
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('direct_debits')
        .delete()
        .in('id', ids);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      showSuccess(`Deleted ${selectedIds.length} direct debit(s) successfully!`);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['directDebits'] });
    },
    onError: (error: any) => {
      showError(error?.message || "Failed to delete selected direct debits.");
    },
  });

  const deleteDirectDebitMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('direct_debits')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directDebits'] });
      showSuccess("Direct Debit deleted successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete Direct Debit.");
      console.error("Delete Direct Debit error:", error);
    },
  });

  const handleSort = (column: keyof DirectDebit) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const renderSortIcon = (column: keyof DirectDebit) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
    }
    return null;
  };

  const clearFilters = () => {
    setFilterPayee('');
    setLocalFilterPayee('');
    setFilterCategory('all');
    setFilterPaymentDate(undefined);
    setFilterStatus('all');
    setFilterSku('');
    setLocalFilterSku('');
    setFilterPaymentReference('');
    setLocalFilterPaymentReference('');
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setCurrentPage(1);
    // Optional: clear selection when filters are cleared
    setSelectedIds([]);
    queryClient.invalidateQueries({ queryKey: ['directDebits'] });
  };

  const hasActiveFilters = filterPayee !== '' || filterCategory !== 'all' || filterPaymentDate !== undefined || filterStatus !== 'all' || filterSku !== '' || filterPaymentReference !== '' || filterStartDate !== undefined || filterEndDate !== undefined;

  const getStatusBadge = (status: DirectDebit['status']) => {
    let className = '';
    switch (status) {
      case 'active':
        className = 'bg-green-500 text-green-50';
        break;
      case 'paused':
        className = 'bg-yellow-500 text-yellow-50';
        break;
      case 'cancelled':
        className = 'bg-red-500 text-red-50';
        break;
      case 'pending':
        className = 'bg-orange-500 text-orange-50';
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return (
      <Badge className={cn(className)}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const handleDirectDebitAdded = () => {
    setIsAddDirectDebitDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['directDebits'] });
    setCurrentPage(1);
  };

  const handleEditClick = (directDebit: DirectDebit) => {
    setEditingDirectDebit(directDebit);
    setIsEditDirectDebitDialogOpen(true);
  };

  const handleDirectDebitUpdated = () => {
    setIsEditDirectDebitDialogOpen(false);
    setEditingDirectDebit(null);
    queryClient.invalidateQueries({ queryKey: ['directDebits'] });
    queryClient.invalidateQueries({ queryKey: ['directDebit', editingDirectDebit?.id] });
  };

  const directDebitExportColumns: (keyof DirectDebit)[] = [
    'id', 'created_at', 'updated_at', 'requester_id', 'payee', 'payment_date',
    'sku', 'not_property_related', 'category', 'account_number', 'payment_reference',
    'status', 'country', 'bank_account'
  ];

  const handleDownloadDirectDebits = () => {
    if (directDebits) {
      exportToCsv(directDebits, `direct_debits_${currentCountry}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`, directDebitExportColumns);
    }
  };

  const totalPages = Math.ceil(totalItems / (itemsPerPage === 'all' ? 1000000000 : itemsPerPage as number));

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

  if (isSessionLoading || isDirectDebitsLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading direct debits...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (directDebitsError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading direct debits: {directDebitsError.message}</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Direct Debits - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex justify-between items-center mb-4">
            <CardTitle className="flex items-center text-2xl font-bold">
              <Banknote className="mr-2 h-6 w-6" /> Direct Debits
            </CardTitle>
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 gap-2">
              {isAdmin && (
                <Button onClick={handleDownloadDirectDebits} className="shadow-sm" variant="outline">
                  <FileDown className="mr-2 h-4 w-4" /> Download to Excel
                </Button>
              )}
              {/* NEW: Rows per page selector */}
              <div className="flex items-center gap-2">
                <label htmlFor="rows-per-page" className="text-sm text-gray-600">Rows per page</label>
                <Select
                  value={String(itemsPerPage)}
                  onValueChange={(value) => {
                    const next = value === 'all' ? 'all' : Number(value);
                    setItemsPerPage(next);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger id="rows-per-page" className="w-[140px]">
                    <SelectValue placeholder={String(itemsPerPage)} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Dialog open={isAddDirectDebitDialogOpen} onOpenChange={setIsAddDirectDebitDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="shadow-sm">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add New Direct Debit
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Direct Debit</DialogTitle>
                  </DialogHeader>
                  <AddDirectDebitForm onDirectDebitAdded={handleDirectDebitAdded} />
                </DialogContent>
              </Dialog>
              {/* NEW: Admin-only bulk delete */}
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-600 hover:bg-red-50 shadow-sm"
                      disabled={selectedIds.length === 0 || bulkDeleteMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Bulk Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selectedIds.length} selected item(s)?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. Selected direct debits will be permanently deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => bulkDeleteMutation.mutate(selectedIds)} asChild>
                        <Button variant="destructive">Delete</Button>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
          <CardDescription>
            Manage your recurring direct debit payments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 p-4 border rounded-md bg-gray-50 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Filter Direct Debits</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {isAdmin && (
                <div>
                  <label htmlFor="country-selector" className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <CountrySelector className="w-full" triggerClassName="w-full" />
                </div>
              )}
              <div>
                <label htmlFor="payee-filter" className="block text-sm font-medium text-gray-700 mb-1">Payee</label>
                <Input
                  id="payee-filter"
                  placeholder="e.g., Utility Company"
                  value={localFilterPayee}
                  onChange={(e) => {
                    setLocalFilterPayee(e.target.value);
                    handleTextFilterChange(setFilterPayee, e.target.value);
                  }}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="sku-filter" className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                <Input
                  id="sku-filter"
                  placeholder="e.g., SKU456"
                  value={localFilterSku}
                  onChange={(e) => {
                    setLocalFilterSku(e.target.value);
                    handleTextFilterChange(setFilterSku, e.target.value);
                  }}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="payment-reference-filter" className="block text-sm font-medium text-gray-700 mb-1">Payment Reference</label>
                <Input
                  id="payment-reference-filter"
                  placeholder="e.g., INV-2023-001"
                  value={localFilterPaymentReference}
                  onChange={(e) => {
                    setLocalFilterPaymentReference(e.target.value);
                    handleTextFilterChange(setFilterPaymentReference, e.target.value);
                  }}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <Select value={filterCategory} onValueChange={(value) => { setFilterCategory(value); setCurrentPage(1); }}>
                  <SelectTrigger id="category-filter" className="w-full">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="payment-date-filter" className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                <DatePicker
                  id="payment-date-filter"
                  date={filterPaymentDate}
                  setDate={(date) => { setFilterPaymentDate(date); setCurrentPage(1); }}
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
              <div>
                <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <Select value={filterStatus} onValueChange={(value: DirectDebit['status'] | 'all') => { setFilterStatus(value); setCurrentPage(1); }}>
                  <SelectTrigger id="status-filter" className="w-full">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
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

          {directDebits && directDebits.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* NEW: Select all checkbox */}
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={(checked) => toggleSelectAllVisible(Boolean(checked))}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payee')}>
                      <div className="flex items-center">
                        Payee {renderSortIcon('payee')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payment_date')}>
                      <div className="flex items-center">
                        Payment Date {renderSortIcon('payment_date')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('sku')}>
                      <div className="flex items-center">
                        SKU {renderSortIcon('sku')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('category')}>
                      <div className="flex items-center">
                        Category {renderSortIcon('category')}
                      </div>
                    </TableHead>
                    <TableHead>Account Number</TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payment_reference')}>
                      <div className="flex items-center">
                        Payment Reference {renderSortIcon('payment_reference')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('bank_account')}>
                      <div className="flex items-center">
                        Bank Account {renderSortIcon('bank_account')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('status')}>
                      <div className="flex items-center">
                        Status {renderSortIcon('status')}
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {directDebits.map((debit) => (
                    <TableRow key={debit.id} className="hover:bg-gradient-to-r hover:from-dyad-blue-light/5 hover:to-background">
                      {/* NEW: Row selection checkbox */}
                      <TableCell className="w-12">
                        <Checkbox
                          checked={selectedIds.includes(debit.id)}
                          onCheckedChange={(checked) => toggleRowSelection(debit.id, Boolean(checked))}
                          aria-label={`Select ${debit.payee}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{debit.payee}</TableCell>
                      <TableCell>{format(new Date(debit.payment_date), 'PPP')}</TableCell>
                      <TableCell>
                        {debit.not_property_related ? 'N/A (Not Property Related)' : (debit.sku || 'N/A')}
                      </TableCell>
                      <TableCell>{categoryOptions.find(c => c.value === debit.category)?.label || debit.category}</TableCell>
                      <TableCell>{debit.account_number}</TableCell>
                      <TableCell>{debit.payment_reference || 'N/A'}</TableCell>
                      <TableCell>{debit.bank_account || 'N/A'}</TableCell>
                      <TableCell>{getStatusBadge(debit.status)}</TableCell>
                      <TableCell className="text-right flex items-center justify-end space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="shadow-sm"
                          onClick={() => navigate(`/direct-debit/${debit.id}`)}
                        >
                          <Eye className="h-4 w-4" /> View
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shadow-sm"
                            onClick={() => handleEditClick(debit)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-500 border-red-500 hover:bg-red-50 shadow-sm"
                              disabled={deleteDirectDebitMutation.isPending || !isAdmin}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the direct debit for <strong>{debit.payee}</strong>.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteDirectDebitMutation.mutate(debit.id)} asChild>
                                <Button variant="destructive">
                                  Delete
                                </Button>
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground mt-8">No direct debits found matching your criteria.</p>
          )}
          {/* NEW: Hide pagination when viewing all */}
          {itemsPerPage !== 'all' && totalPages > 1 && (
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

      {editingDirectDebit && (
        <Dialog open={isEditDirectDebitDialogOpen} onOpenChange={setIsEditDirectDebitDialogOpen}>
          <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Direct Debit: {editingDirectDebit.payee}</DialogTitle>
            </DialogHeader>
            <EditDirectDebitForm directDebit={editingDirectDebit} onDirectDebitUpdated={handleDirectDebitUpdated} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default DirectDebits;