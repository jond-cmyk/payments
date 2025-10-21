"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { StandingOrder } from '@/types/supabase';
import { format } from 'date-fns';
import { Repeat, PlusCircle, Filter, RotateCcw, ArrowUp, ArrowDown, Edit, Trash2, Eye, FileDown, DollarSign } from 'lucide-react';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';
import { exportToCsv } from '@/utils/exportToCsv';
import { formatAmount } from '@/components/economic/EconomicDetailDialog';

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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import AddStandingOrderForm from '@/components/standing-orders/AddStandingOrderForm';
import UpdateStandingOrderForm from '@/components/standing-orders/UpdateStandingOrderForm';
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

const StandingOrders = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [isAddStandingOrderDialogOpen, setIsAddStandingOrderDialogOpen] = useState(false);
  const [isEditStandingOrderDialogOpen, setIsEditStandingOrderDialogOpen] = useState(false);
  const [editingStandingOrder, setEditingStandingOrder] = useState<StandingOrder | null>(null);

  // Filter states (debounced for query)
  const [filterPayee, setFilterPayee] = useState<string>('');
  const [filterCategories, setFilterCategories] = useState<string[]>([]); // CHANGED: Array state
  const [filterStatuses, setFilterStatuses] = useState<StandingOrder['status'][]>([]); // CHANGED: Array state
  const [filterSku, setFilterSku] = useState<string>('');
  const [filterPaymentReference, setFilterPaymentReference] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(undefined);
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(undefined);
  const [filterPaymentDay, setFilterPaymentDay] = useState<number | undefined>(undefined);

  // Local states for immediate input feedback
  const [localFilterPayee, setLocalFilterPayee] = useState<string>('');
  const [localFilterSku, setLocalFilterSku] = useState<string>('');
  const [localFilterPaymentReference, setLocalFilterPaymentReference] = useState<string>('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(ITEMS_PER_PAGE); // Default to 10 items per page

  // NEW: Bulk selection state
  const [selectedStandingOrderIds, setSelectedStandingOrderIds] = useState<string[]>([]);

  // Sorting states
  const [sortColumn, setSortColumn] = useState<keyof StandingOrder>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Define options for MultiSelectFilter
  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'awaiting_info', label: 'Awaiting Info' },
    { value: 'pending', label: 'Pending' },
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
      setFilterStatuses([statusParam as StandingOrder['status']]);
    } else {
      setFilterStatuses([]); // Default to empty array, meaning no status filter applied initially
    }
    setCurrentPage(1);
  }, [searchParams]); // Depend on searchParams

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

  const isAdmin = userProfile?.role === 'admin';

  // Fetch Standing Orders
  const { data: standingOrders, isLoading: isStandingOrdersLoading, error: standingOrdersError } = useQuery<StandingOrder[]>({
    queryKey: ['standingOrders', currentCountry, filterPayee, filterCategories, filterStatuses, filterSku, filterPaymentReference, filterStartDate, filterEndDate, filterPaymentDay, sortColumn, sortDirection, currentPage, itemsPerPage],
    queryFn: async () => {
      if (!session) return [];

      const from = itemsPerPage === 'all' ? 0 : (currentPage - 1) * (itemsPerPage as number); // Use itemsPerPage instead of ITEMS_PER_PAGE
      const to = itemsPerPage === 'all' ? null : from + (itemsPerPage as number) - 1; // Handle show all case

      let query = supabase
        .from('standing_orders')
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

      // Multi-select Category filter (FIXED JSONB QUERY LOGIC)
      const nonAllCategories = filterCategories.filter(c => c !== 'all');
      if (nonAllCategories.length > 0) {
        // Build an OR condition for each selected category using the JSONB containment operator (@>)
        // We check if the 'categories' array contains an object where the 'category' key matches the filter value.
        const categoryFilters = nonAllCategories.map(category => 
          `categories.cs.[{"category": "${category}"}]` // Use .cs (contains) with the specific object structure
        ).join(',');
        
        // Use .or() to combine the filters
        query = query.or(categoryFilters);
      }

      // NEW: Apply date range filters
      if (filterStartDate) {
        query = query.gte('payment_date', format(filterStartDate, 'yyyy-MM-dd'));
      }
      if (filterEndDate) {
        query = query.lte('payment_date', format(filterEndDate, 'yyyy-MM-dd'));
      }
      
      if (filterSku) {
        query = query.ilike('sku', `%${filterSku}%`);
      }
      if (filterPaymentReference) {
        query = query.ilike('payment_reference', `%${filterPaymentReference}%`);
      }
      // Add payment day filter
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

      if (itemsPerPage !== 'all') { // Only apply range if not showing all
        query = query.range(from, to);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setTotalItems(count || 0);
      return data;
    },
    enabled: !!session,
  });

  // Clear selection when data or page changes
  useEffect(() => {
    setSelectedStandingOrderIds([]);
  }, [standingOrders, currentPage]);

  // NEW: Selection helpers
  const isAllSelected = (standingOrders?.length || 0) > 0 && selectedStandingOrderIds.length === (standingOrders?.length || 0);
  const handleToggleSelectAll = (checked: boolean) => {
    if (!standingOrders) return;
    setSelectedStandingOrderIds(checked ? standingOrders.map(o => o.id) : []);
  };
  const handleToggleSelect = (id: string, checked: boolean) => {
    setSelectedStandingOrderIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  };

  // NEW: Bulk delete mutation
  const deleteMultipleStandingOrdersMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('standing_orders').delete().in('id', ids);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      setSelectedStandingOrderIds([]);
      queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
      queryClient.invalidateQueries({ queryKey: ['pendingStandingOrders'] });
      showSuccess(`Deleted ${selectedStandingOrderIds.length} standing order(s) successfully!`);
    },
    onError: (error: any) => {
      showError(error.message || "Failed to bulk delete standing orders.");
      console.error("Bulk delete Standing Orders error:", error);
    },
  });

  const deleteStandingOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('standing_orders')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
      queryClient.invalidateQueries({ queryKey: ['pendingStandingOrders'] }); // Invalidate pending standing orders
      showSuccess("Standing Order deleted successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete Standing Order.");
      console.error("Delete Standing Order error:", error);
    },
  });

  const handleSort = (column: keyof StandingOrder) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const renderSortIcon = (column: keyof StandingOrder) => {
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
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setFilterPaymentDay(undefined);
    setCurrentPage(1);
    queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
  };

  const hasActiveFilters = filterPayee !== '' || filterCategories.length > 0 || filterStatuses.length > 0 || filterSku !== '' || filterPaymentReference !== '' || filterStartDate !== undefined || filterEndDate !== undefined || filterPaymentDay !== undefined;

  const getStatusBadge = (status: StandingOrder['status']) => {
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
      case 'awaiting_info': // Added awaiting_info
        className = 'bg-orange-500 text-orange-50';
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

  const handleStandingOrderAdded = () => {
    setIsAddStandingOrderDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
    queryClient.invalidateQueries({ queryKey: ['pendingStandingOrders'] });
    setCurrentPage(1);
  };

  const handleEditClick = (standingOrder: StandingOrder) => {
    setEditingStandingOrder(standingOrder);
    setIsEditStandingOrderDialogOpen(true);
  };

  const handleStandingOrderUpdated = () => {
    setIsEditStandingOrderDialogOpen(false);
    setEditingStandingOrder(null);
    queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
    queryClient.invalidateQueries({ queryKey: ['standingOrder', editingStandingOrder?.id] });
    queryClient.invalidateQueries({ queryKey: ['pendingStandingOrders'] });
  };

  const standingOrderExportColumns: (keyof StandingOrder)[] = [
    'id', 'created_at', 'updated_at', 'requester_id', 'payee', 'payment_date',
    'sku', 'not_property_related', 'categories', 'total_amount', 'account_name', 'account_address',
    'iban_number', 'sort_code', 'account_number', 'from_day', 'to_day',
    'payment_reference', 'status', 'country', 'bank_details_verified', 'payment_day', 'currency', 'bank_account'
  ];

  const handleDownloadStandingOrders = () => {
    if (standingOrders) {
      // Flatten categories for CSV export
      const flattenedData = standingOrders.map(order => {
        const base = { ...order };
        // Remove original categories and total_amount for flattening
        delete (base as any).categories;
        // total_amount is now explicitly included in the export columns, so no need to delete it here.

        // Add flattened categories
        order.categories.forEach((cat, index) => {
          (base as any)[`category_${index + 1}`] = categoryOptions.find(c => c.value === cat.category)?.label || cat.category;
          (base as any)[`amount_${index + 1}`] = cat.amount;
        });
        return base;
      });

      // Dynamically generate headers for flattened categories
      const dynamicCategoryHeaders: string[] = [];
      let maxCategories = 0;
      standingOrders.forEach(order => {
        if (order.categories.length > maxCategories) {
          maxCategories = order.categories.length;
        }
      });
      for (let i = 1; i <= maxCategories; i++) {
        dynamicCategoryHeaders.push(`category_${i}`);
        dynamicCategoryHeaders.push(`amount_${i}`);
      }

      // Construct the final column order for CSV
      const baseColumns = [
        'id', 'created_at', 'updated_at', 'requester_id', 'payee', 'payment_date',
        'sku', 'not_property_related', ...dynamicCategoryHeaders, 'total_amount', 'account_name', 'account_address',
        'iban_number', 'sort_code', 'account_number', 'from_day', 'to_day',
        'payment_reference', 'status', 'country', 'bank_details_verified', 'payment_day', 'currency', 'bank_account'
      ];

      const finalExportColumns = [...baseColumns, ...dynamicCategoryHeaders];

      exportToCsv(
        flattenedData,
        `standing_orders_${currentCountry}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`,
        finalExportColumns as unknown as (keyof StandingOrder)[]
      );
    }
  };

  const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(totalItems / (itemsPerPage as number)); // Handle show all case

  const renderPaginationItems = () => {
    if (itemsPerPage === 'all' || totalPages <= 1) return null; // No pagination if showing all

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

  if (isSessionLoading || isStandingOrdersLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading standing orders...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (standingOrdersError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading standing orders: {standingOrdersError.message}</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Standing Orders - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex justify-between items-center mb-4">
            <CardTitle className="flex items-center text-2xl font-bold">
              <Repeat className="mr-2 h-6 w-6" /> Standing Orders
            </CardTitle>
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 gap-2">
              {isAdmin && (
                <Button onClick={handleDownloadStandingOrders} className="shadow-sm" variant="outline">
                  <FileDown className="mr-2 h-4 w-4" /> Download to Excel
                </Button>
              )}
              <div className="flex items-center gap-2">
                <label htmlFor="items-per-page" className="text-sm font-medium text-gray-700">
                  Records per page:
                </label>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => {
                    const newItemsPerPage = value === 'all' ? 'all' : parseInt(value);
                    setItemsPerPage(newItemsPerPage);
                    setCurrentPage(1); // Reset to first page when changing items per page
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
              <Dialog open={isAddStandingOrderDialogOpen} onOpenChange={setIsAddStandingOrderDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="shadow-sm">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add New Standing Order
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Standing Order</DialogTitle>
                  </DialogHeader>
                  <AddStandingOrderForm onStandingOrderAdded={handleStandingOrderAdded} />
                </DialogContent>
              </Dialog>
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      className="shadow-sm"
                      variant="destructive"
                      disabled={selectedStandingOrderIds.length === 0 || deleteMultipleStandingOrdersMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Selected ({selectedStandingOrderIds.length})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete selected standing orders?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. You are about to delete {selectedStandingOrderIds.length} standing order(s).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMultipleStandingOrdersMutation.mutate(selectedStandingOrderIds)}
                        asChild
                      >
                        <Button variant="destructive">
                          Confirm Delete
                        </Button>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
          <CardDescription>
            Manage your recurring standing order payments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 p-4 border rounded-md bg-gray-50 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Filter Standing Orders</h3>
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
                  placeholder="e.g., Landlord"
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
                  placeholder="e.g., RENT-001"
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
                  placeholder="e.g., RENT-JAN-2024"
                  value={localFilterPaymentReference}
                  onChange={(e) => {
                    setLocalFilterPaymentReference(e.target.value);
                    handleTextFilterChange(setFilterPaymentReference, e.target.value);
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
                onValueChange={(values) => { setFilterStatuses(values as StandingOrder['status'][]); setCurrentPage(1); }}
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

          {standingOrders && standingOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* NEW: Select-all checkbox column */}
                    <TableHead className="w-12">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={(checked) => handleToggleSelectAll(!!checked)}
                        aria-label="Select all standing orders on this page"
                        disabled={!isAdmin}
                      />
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payee')}>
                      <div className="flex items-center">
                        Payee {renderSortIcon('payee')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('sku')}>
                      <div className="flex items-center">
                        SKU {renderSortIcon('sku')}
                      </div>
                    </TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('total_amount')}>
                      <div className="flex items-center">
                        Amount {renderSortIcon('total_amount')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payment_date')}>
                      <div className="flex items-center">
                        Start Date {renderSortIcon('payment_date')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payment_end_date')}>
                      <div className="flex items-center">
                        End Date {renderSortIcon('payment_end_date')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payment_day')}>
                      <div className="flex items-center">
                        Payment Day {renderSortIcon('payment_day')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('status')}>
                      <div className="flex items-center">
                        Status {renderSortIcon('status')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('country')}>
                      <div className="flex items-center">
                        Country {renderSortIcon('country')}
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {standingOrders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-gradient-to-r hover:from-dyad-blue-light/5 hover:to-background">
                      {/* NEW: Row selection checkbox */}
                      <TableCell className="w-12">
                        <Checkbox
                          checked={selectedStandingOrderIds.includes(order.id)}
                          onCheckedChange={(checked) => handleToggleSelect(order.id, !!checked)}
                          aria-label={`Select ${order.payee}`}
                          disabled={!isAdmin}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{order.payee}</TableCell>
                      <TableCell>
                        {order.not_property_related ? 'N/A (Not Property Related)' : (order.sku || 'N/A')}
                      </TableCell>
                      <TableCell>
                        {order.categories && order.categories.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {order.categories.map((cat, idx) => (
                              <Badge key={idx} variant="secondary" className="bg-gray-100 text-gray-800">
                                {categoryOptions.find(c => c.value === cat.category)?.label || cat.category}
                              </Badge>
                            ))}
                          </div>
                        ) : 'N/A'}
                      </TableCell>
                      <TableCell>{formatAmount(order.total_amount)}</TableCell>
                      <TableCell>{format(new Date(order.payment_date), 'PPP')}</TableCell>
                      <TableCell>{order.payment_end_date ? format(new Date(order.payment_end_date), 'PPP') : 'No end date'}</TableCell>
                      <TableCell>{order.payment_day ? `Day ${order.payment_day}` : 'N/A'}</TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell>{order.country}</TableCell>
                      <TableCell className="text-right flex items-center justify-end space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="shadow-sm"
                          onClick={() => navigate(`/standing-order/${order.id}`)}
                        >
                          <Eye className="h-4 w-4" /> View
                        </Button>
                        {isAdmin && (
                          <Button variant="outline" size="sm" className="shadow-sm" onClick={() => handleEditClick(order)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-500 border-red-500 hover:bg-red-50 shadow-sm"
                              disabled={deleteStandingOrderMutation.isPending || !isAdmin}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the standing order for <strong>{order.payee}</strong>.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteStandingOrderMutation.mutate(order.id)} asChild>
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
            <p className="text-center text-muted-foreground mt-8">No standing orders found matching your criteria.</p>
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

      {editingStandingOrder && (
        <Dialog open={isEditStandingOrderDialogOpen} onOpenChange={setIsEditStandingOrderDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Standing Order: {editingStandingOrder.payee}</DialogTitle>
            </DialogHeader>
            <UpdateStandingOrderForm standingOrder={editingStandingOrder} onStandingOrderUpdated={handleStandingOrderUpdated} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default StandingOrders;