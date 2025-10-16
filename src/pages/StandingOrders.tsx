"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { StandingOrder } from '@/types/supabase';
import { format } from 'date-fns';
import { Repeat, PlusCircle, Filter, RotateCcw, ArrowUp, ArrowDown, Edit, Trash2, Eye, FileDown, DollarSign } from 'lucide-react'; // Import DollarSign
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

const ITEMS_PER_PAGE = 10;

const StandingOrders = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddStandingOrderDialogOpen, setIsAddStandingOrderDialogOpen] = useState(false);
  const [isEditStandingOrderDialogOpen, setIsEditStandingOrderDialogOpen] = useState(false);
  const [editingStandingOrder, setEditingStandingOrder] = useState<StandingOrder | null>(null);

  // Filter states (debounced for query)
  const [filterPayee, setFilterPayee] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPaymentDate, setFilterPaymentDate] = useState<Date | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<StandingOrder['status'] | 'all'>('all');
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
  const [itemsPerPage, setItemsPerPage] = useState(10); // Default to 10 items per page

  // NEW: Bulk selection state
  const [selectedStandingOrderIds, setSelectedStandingOrderIds] = useState<string[]>([]);

  // Sorting states
  const [sortColumn, setSortColumn] = useState<keyof StandingOrder>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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

  // Fetch Standing Orders
  const { data: standingOrders, isLoading: isStandingOrdersLoading, error: standingOrdersError } = useQuery<StandingOrder[]>({
    queryKey: ['standingOrders', currentCountry, filterPayee, filterCategory, filterPaymentDate, filterStatus, filterSku, filterPaymentReference, filterStartDate, filterEndDate, sortColumn, sortDirection, currentPage, itemsPerPage],
    queryFn: async () => {
      if (!session) return [];

      const from = (currentPage - 1) * itemsPerPage; // Use itemsPerPage instead of ITEMS_PER_PAGE
      const to = itemsPerPage === -1 ? -1 : from + itemsPerPage - 1; // Handle show all case

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
      if (filterCategory !== 'all') {
        // Filter by category within the JSONB array
        query = query.contains('categories', [{ category: filterCategory }]);
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
      // Add payment day filter
      if (filterPaymentDay) {
        query = query.eq('payment_day', filterPaymentDay);
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

      if (itemsPerPage !== -1) { // Only apply range if not showing all
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
      showSuccess("Selected standing orders deleted successfully!");
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
    setFilterCategory('all');
    setFilterPaymentDate(undefined);
    setFilterStatus('all');
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

  const hasActiveFilters = filterPayee !== '' || filterCategory !== 'all' || filterStatus !== 'all' || filterSku !== '' || filterPaymentReference !== '' || filterStartDate !== undefined || filterEndDate !== undefined || filterPaymentDay !== undefined;

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
    'payment_reference', 'status', 'country', 'bank_details_verified'
  ];

  const handleDownloadStandingOrders = () => {
    if (standingOrders) {
      // Flatten categories for CSV export
      const flattenedData = standingOrders.map(order => {
        const base = { ...order };
        // Remove original categories and total_amount for flattening
        delete (base as any).categories;
        delete (base as any).total_amount;

        // Add flattened categories
        order.categories.forEach((cat, index) => {
          (base as any)[`category_${index + 1}`] = categoryOptions.find(c => c.value === cat.category)?.label || cat.category;
          (base as any)[`amount_${index + 1}`] = cat.amount;
        });
        (base as any)['total_amount'] = order.total_amount; // Add total amount back
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
      const finalExportColumns = [
        'id', 'created_at', 'updated_at', 'requester_id', 'payee', 'payment_date',
        'sku', 'not_property_related', ...dynamicCategoryHeaders, 'total_amount', 'account_name', 'account_address',
        'iban_number', 'sort_code', 'account_number', 'from_day', 'to_day',
        'payment_reference', 'status', 'country', 'bank_details_verified'
      ];

      exportToCsv(flattenedData, `standing_orders_${currentCountry}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`, finalExportColumns);
    }
  };

  const totalPages = itemsPerPage === -1 ? 1 : Math.ceil(totalItems / itemsPerPage); // Handle show all case

  const renderPaginationItems = () => {
    if (itemsPerPage === -1) return null; // No pagination if showing all

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
            <div className="flex space-x-2">
              {isAdmin && (
                <Button onClick={handleDownloadStandingOrders} className="shadow-sm" variant="outline">
                  <FileDown className="mr-2 h-4 w-4" /> Download to Excel
                </Button>
              )}
              {/* NEW: Bulk Delete Selected */}
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
            </div>
          </div>
          <CardDescription>
            Manage your recurring standing order payments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 p-4 border rounded-md bg-gray-50 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Filter Standing Orders</h3>
              {/* NEW: Records per page selector */}
              <div className="flex items-center gap-2">
                <label htmlFor="items-per-page" className="text-sm font-medium text-gray-700">
                  Records per page:
                </label>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => {
                    const newItemsPerPage = parseInt(value);
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
                    <SelectItem value="-1">Show All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
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
              <div>
                <label htmlFor="payment-date-filter" className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                <Input
                  id="payment-date-filter"
                  type="date"
                  value={filterPaymentDate ? format(filterPaymentDate, 'yyyy-MM-dd') : ''}
                  onChange={(e) => {
                    const dateValue = e.target.value ? new Date(e.target.value) : undefined;
                    setFilterPaymentDate(dateValue);
                    setCurrentPage(1);
                  }}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <Select value={filterStatus} onValueChange={(value: StandingOrder['status'] | 'all') => { setFilterStatus(value); setCurrentPage(1); }}>
                  <SelectTrigger id="status-filter" className="w-full">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="awaiting_info">Awaiting Info</SelectItem>
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
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payment_date')}>
                      <div className="flex items-center">
                        Start Date {renderSortIcon('payment_date')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('sku')}>
                      <div className="flex items-center">
                        SKU {renderSortIcon('sku')}
                      </div>
                    </TableHead>
                    <TableHead>Categories</TableHead> {/* Updated header */}
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('total_amount')}>
                      <div className="flex items-center">
                        Total Amount {renderSortIcon('total_amount')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('account_name')}>
                      <div className="flex items-center">
                        Account Name {renderSortIcon('account_name')}
                      </div>
                    </TableHead>
                    <TableHead>Bank Details</TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('from_day')}>
                      <div className="flex items-center">
                        Accruals Period {renderSortIcon('from_day')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payment_reference')}>
                      <div className="flex items-center">
                        Payment Reference {renderSortIcon('payment_reference')}
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
                      <TableCell>{format(new Date(order.payment_date), 'PPP')}</TableCell>
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
                      <TableCell>{order.total_amount.toFixed(2)}</TableCell>
                      <TableCell>{order.account_name}</TableCell>
                      <TableCell>
                        {order.country === 'United Kingdom' ? (
                          <>
                            Sort: {order.sort_code || 'N/A'}<br />
                            Acc: {order.account_number ? order.account_number.replace(/(\d{4})(\d{4})/, '$1 $2') : 'N/A'}
                          </>
                        ) : (
                          <>
                            IBAN: {order.iban_number || 'N/A'}<br />
                            Addr: {order.account_address || 'N/A'}
                          </>
                        )}
                      </TableCell>
                      <TableCell>Day {order.from_day} to Day {order.to_day}</TableCell>
                      <TableCell>{order.payment_reference || 'N/A'}</TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
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