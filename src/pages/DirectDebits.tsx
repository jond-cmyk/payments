"use client";

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { DirectDebit, Profile } from '@/types/supabase';
import { format } from 'date-fns';
import { Banknote, PlusCircle, Filter, RotateCcw, ArrowUp, ArrowDown, Edit, Trash2, Eye, FileDown } from 'lucide-react';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';
import { exportToCsv } from '@/utils/exportToCsv';
import { formatAmount } from '@/components/economic/EconomicDetailDialog';
import { useDepartments } from '@/hooks/useDepartments';

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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
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
import MultiSelectFilter from '@/components/MultiSelectFilter'; // NEW IMPORT

const ITEMS_PER_PAGE = 10;

const DirectDebits = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [isAddDirectDebitDialogOpen, setIsAddDirectDebitDialogOpen] = useState(false);
  const [isEditDirectDebitDialogOpen, setIsEditDirectDebitDialogOpen] = useState(false);
  const [editingDirectDebit, setEditingDirectDebit] = useState<DirectDebit | null>(null);

  // Filter states (debounced for query)
  const [filterPayee, setFilterPayee] = useState<string>('');
  const [filterCategories, setFilterCategories] = useState<string[]>([]); // CHANGED: Array state
  const [filterStatuses, setFilterStatuses] = useState<DirectDebit['status'][]>([]); // CHANGED: Array state
  const [filterSku, setFilterSku] = useState<string>('');
  const [filterPaymentReference, setFilterPaymentReference] = useState<string>('');
  const [filterPaymentDay, setFilterPaymentDay] = useState<number | undefined>(undefined);
  const [filterAccountNumber, setFilterAccountNumber] = useState<string>('');

  // Local states for immediate input feedback
  const [localFilterPayee, setLocalFilterPayee] = useState<string>('');
  const [localFilterSku, setLocalFilterSku] = useState<string>('');
  const [localFilterPaymentReference, setLocalFilterPaymentReference] = useState<string>('');
  const [localFilterAccountNumber, setLocalFilterAccountNumber] = useState<string>('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(ITEMS_PER_PAGE);

  // Row selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toggleRowSelection = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id));
  }, []);

  // Sorting states
  const [sortColumn, setSortColumn] = useState<keyof DirectDebit | null>('payment_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // NEW: Fetch departments
  const { data: departments, isLoading: isLoadingDepartments } = useDepartments(currentCountry);

  // NEW: Create a map for quick SKU to address lookup
  const departmentMap = useMemo(() => {
    if (!departments) return new Map<number, string>();
    return new Map(departments.map(d => [d.departmentNumber, d.name]));
  }, [departments]);

  const getAddressFromSku = (sku: string | null | undefined): string => {
    if (!sku) return 'N/A';
    const numericSku = parseInt(sku.replace(/\D/g, ''), 10);
    if (isNaN(numericSku)) return 'N/A';
    return departmentMap.get(numericSku) || 'Not Found';
  };

  // Define options for MultiSelectFilter
  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const categoryFilterOptions = [
    { value: 'all', label: 'All Categories' },
    ...categoryOptions.map(opt => ({ value: opt.value, label: opt.label }))
  ];

  // Effect to read URL parameters for initial filter state
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      setFilterStatuses([statusParam as DirectDebit['status']]);
    } else {
      setFilterStatuses([]); // Default to empty array, meaning no status filter applied initially
    }
    setCurrentPage(1);
  }, [searchParams]);

  // Debounce for text inputs
  const debounceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextFilterChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      setter(value);
      setCurrentPage(1);
    }, 700); // Increased debounce time to 700ms
  }, []);

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

  useEffect(() => {
    setLocalFilterAccountNumber(filterAccountNumber);
  }, [filterAccountNumber]);

  const isAdmin = userProfile?.role === 'admin';

  // Fetch Direct Debits
  const { data: directDebits, isLoading: isDirectDebitsLoading, error: directDebitsError } = useQuery<DirectDebit[]>({
    queryKey: ['directDebits', currentCountry, filterPayee, filterCategories, filterStatuses, filterSku, filterPaymentReference, filterPaymentDay, filterAccountNumber, sortColumn, sortDirection, currentPage, itemsPerPage],
    queryFn: async () => {
      if (!session) return [];

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
      
      // Multi-select Status filter
      const nonAllStatuses = (filterStatuses as string[]).filter(s => s !== 'all');
      if (nonAllStatuses.length > 0) {
        query = query.in('status', nonAllStatuses);
      }

      // Multi-select Category filter
      const nonAllCategories = filterCategories.filter(c => c !== 'all');
      if (nonAllCategories.length > 0) {
        const categoryFilters = nonAllCategories.map(category => 
          `categories.cs.["${category}"]`
        ).join(',');
        query = query.or(categoryFilters);
      }

      if (filterSku) {
        query = query.ilike('sku', `%${filterSku}%`);
      }
      if (filterPaymentReference) {
        query = query.ilike('payment_reference', `%${filterPaymentReference}%`);
      }
      if (filterAccountNumber) {
        query = query.ilike('account_number', `%${filterAccountNumber}%`);
      }
      if (filterPaymentDay) {
        query = query.eq('payment_day', filterPaymentDay);
      }

      // Apply sorting
      if (sortColumn) {
        query = query.order(sortColumn as string, { ascending: sortDirection === 'asc' });
      }
      if (sortColumn !== 'created_at') {
        query = query.order('created_at', { ascending: false });
      }
      if (sortColumn !== 'id') {
        query = query.order('id', { ascending: false });
      }

      // Apply range only when not 'all'
      if (to !== null) {
        query = query.range(from, to);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setTotalItems(count || 0); // Set total items for pagination
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
    setFilterCategories([]); // Reset to empty array
    setFilterStatuses([]); // Reset to empty array
    setFilterSku('');
    setLocalFilterSku('');
    setFilterPaymentReference('');
    setLocalFilterPaymentReference('');
    setFilterPaymentDay(undefined);
    setFilterAccountNumber('');
    setLocalFilterAccountNumber('');
    setCurrentPage(1);
    setSelectedIds([]);
    queryClient.invalidateQueries({ queryKey: ['directDebits'] });
  };

  const hasActiveFilters = filterPayee !== '' || filterCategories.length > 0 || filterStatuses.length > 0 || filterSku !== '' || filterPaymentReference !== '' || filterPaymentDay !== undefined || filterAccountNumber !== '';

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
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return (
      <Badge className={cn(className)}>
        {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')}
      </Badge>
    );
  };

  const handleDirectDebitAdded = () => {
    setIsAddDirectDebitDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['directDebits'] });
    setCurrentPage(1);
  };

  const handleEditClick = (debit: DirectDebit) => {
    setEditingDirectDebit(debit);
    setIsEditDirectDebitDialogOpen(true);
  };

  const handleDirectDebitUpdated = () => {
    setIsEditDirectDebitDialogOpen(false);
    setEditingDirectDebit(null);
    queryClient.invalidateQueries({ queryKey: ['directDebits'] }); // Invalidate list
    queryClient.invalidateQueries({ queryKey: ['directDebit', editingDirectDebit?.id] }); // Invalidate detail view
    queryClient.invalidateQueries({ queryKey: ['directDebitAudits', editingDirectDebit?.id] }); // Invalidate audits
  };

  const directDebitExportColumns: (keyof DirectDebit)[] = [
    'id', 'created_at', 'updated_at', 'requester_id', 'payee', 'payment_date',
    'sku', 'not_property_related', 'categories', 'total_amount', 'account_number', 'payment_reference',
    'status', 'country', 'bank_account', 'payment_day'
  ];

  const handleDownloadDirectDebits = () => {
    if (directDebits) {
      exportToCsv(directDebits, `direct_debits_${currentCountry}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`, directDebitExportColumns);
    }
  };

  const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(totalItems / (itemsPerPage as number));

  const renderPaginationItems = () => {
    if (itemsPerPage === 'all' || totalPages <= 1) return null;

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

  if (isSessionLoading || isDirectDebitsLoading || isLoadingDepartments) {
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
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Direct Debit</DialogTitle>
                    <DialogDescription>
                      Fill in the details to create a new recurring direct debit.
                    </DialogDescription>
                  </DialogHeader>
                  <AddDirectDebitForm onDirectDebitAdded={handleDirectDebitAdded} />
                </DialogContent>
              </Dialog>
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
                <label htmlFor="account-number-filter" className="block text-sm font-medium text-gray-700 mb-1">Supplier Account Number</label>
                <Input
                  id="account-number-filter"
                  placeholder="e.g., 12345678"
                  value={localFilterAccountNumber}
                  onChange={(e) => {
                    setLocalFilterAccountNumber(e.target.value);
                    handleTextFilterChange(setFilterAccountNumber, e.target.value);
                  }}
                  className="w-full"
                />
              </div>
              <MultiSelectFilter
                label="Category"
                placeholder="Select Categories"
                options={categoryFilterOptions}
                selectedValues={filterCategories}
                onValueChange={(values) => { setFilterCategories(values); setCurrentPage(1); }}
              />
              <div>
                <label htmlFor="payment-day-filter" className="block text-sm font-medium text-gray-700 mb-1">Payment Day</label>
                <Select 
                  value={filterPaymentDay?.toString() || 'all'} 
                  onValueChange={(value) => { 
                    setFilterPaymentDay(value === 'all' ? undefined : parseInt(value, 10)); 
                    setCurrentPage(1); 
                  }}
                >
                  <SelectTrigger id="payment-day-filter" className="w-full">
                    <SelectValue placeholder="All Days" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Days</SelectItem>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <SelectItem key={day} value={day.toString()}>
                        Day {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <MultiSelectFilter
                label="Status"
                placeholder="Select Statuses"
                options={statusOptions}
                selectedValues={filterStatuses}
                onValueChange={(values) => { setFilterStatuses(values as DirectDebit['status'][]); setCurrentPage(1); }}
              />
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
                    <TableHead className="w-12 th-resizable">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={(checked) => toggleSelectAllVisible(Boolean(checked))}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('payee')}>
                      <div className="flex items-center">
                        Payee {renderSortIcon('payee')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('sku')}>
                      <div className="flex items-center">
                        SKU {renderSortIcon('sku')}
                      </div>
                    </TableHead>
                    <TableHead className="th-resizable w-[150px]">Property Address</TableHead>
                    <TableHead className="th-resizable">Categories</TableHead>
                    <TableHead className="th-resizable">Total Amount</TableHead>
                    <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('payment_day')}>
                      <div className="flex items-center">
                        Payment Day {renderSortIcon('payment_day')}
                      </div>
                    </TableHead>
                    <TableHead className="th-resizable">Payment Reference</TableHead>
                    <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('status')}>
                      <div className="flex items-center">
                        Status {renderSortIcon('status')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('country')}>
                      <div className="flex items-center">
                        Country {renderSortIcon('country')}
                      </div>
                    </TableHead>
                    <TableHead className="th-resizable">Supplier Account Number</TableHead>
                    <TableHead className="text-right th-resizable">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {directDebits.map((debit) => {
                    const isRequester = user?.id === debit.requester_id;
                    return (
                      <TableRow key={debit.id} className="hover:bg-gradient-to-r hover:from-dyad-blue-light/5 hover:to-background">
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(debit.id)}
                            onCheckedChange={(checked) => toggleRowSelection(debit.id, Boolean(checked))}
                            aria-label={`Select ${debit.payee}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{debit.payee}</TableCell>
                        <TableCell>
                          {debit.not_property_related ? 'N/A (Not Property Related)' : (debit.sku || 'N/A')}
                        </TableCell>
                        <TableCell>
                          {debit.not_property_related ? 'N/A' : getAddressFromSku(debit.sku)}
                        </TableCell>
                        <TableCell>
                          {debit.categories && debit.categories.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {debit.categories.map((cat, idx) => (
                                <Badge key={idx} variant="secondary" className="bg-gray-100 text-gray-800">
                                  {categoryOptions.find(c => c.value === cat)?.label || cat}
                                </Badge>
                              ))}
                            </div>
                          ) : 'N/A'}
                        </TableCell>
                        <TableCell>{formatAmount(debit.total_amount)}</TableCell>
                        <TableCell>{debit.payment_day !== null && debit.payment_day !== undefined ? debit.payment_day : 'N/A'}</TableCell>
                        <TableCell>{debit.payment_reference || 'N/A'}</TableCell>
                        <TableCell>{getStatusBadge(debit.status)}</TableCell>
                        <TableCell>{debit.country}</TableCell>
                        <TableCell>{debit.account_number}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end space-y-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="shadow-sm w-full"
                              onClick={() => navigate(`/direct-debit/${debit.id}`)}
                            >
                              <Eye className="h-4 w-4 mr-2" /> View
                            </Button>
                            {(isAdmin || isRequester) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="shadow-sm w-full"
                                onClick={() => handleEditClick(debit)}
                              >
                                <Edit className="h-4 w-4 mr-2" /> Edit
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-500 border-red-500 hover:bg-red-50 shadow-sm w-full"
                                  disabled={deleteDirectDebitMutation.isPending || !isAdmin}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
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
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground mt-8">No direct debits found matching your criteria.</p>
          )}
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
              <DialogDescription>
                Update the details for this recurring direct debit.
              </DialogDescription>
            </DialogHeader>
            <EditDirectDebitForm directDebit={editingDirectDebit} onDirectDebitUpdated={handleDirectDebitUpdated} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default DirectDebits;