"use client";

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { StandingOrder } from '@/types/supabase';
import { format, differenceInDays, parseISO } from 'date-fns';
import { Repeat, PlusCircle, Filter, RotateCcw, ArrowUp, ArrowDown, Edit, Trash2, Eye, FileDown, DollarSign, RefreshCw, AlertTriangle, Loader2, CheckSquare, Square } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress'; // Assuming you have a Progress component, or I'll use standard HTML

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
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<StandingOrder['status'][]>([]);
  const [filterSku, setFilterSku] = useState<string>('');
  const [filterPaymentReference, setFilterPaymentReference] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(undefined);
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(undefined);
  const [filterPaymentDay, setFilterPaymentDay] = useState<number | undefined>(undefined);
  const [filterDateDiscrepancy, setFilterDateDiscrepancy] = useState<boolean>(false); 

  // Local states for immediate input feedback
  const [localFilterPayee, setLocalFilterPayee] = useState<string>('');
  const [localFilterSku, setLocalFilterSku] = useState<string>('');
  const [localFilterPaymentReference, setLocalFilterPaymentReference] = useState<string>('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(ITEMS_PER_PAGE);

  // Bulk selection state
  const [selectedStandingOrderIds, setSelectedStandingOrderIds] = useState<string[]>([]);

  // Sorting states
  const [sortColumn, setSortColumn] = useState<keyof StandingOrder>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Bulk Sync State
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncTotal, setSyncTotal] = useState(0);
  const [isBulkSyncDialogOpen, setIsBulkSyncDialogOpen] = useState(false);
  const [bulkSyncResults, setBulkSyncResults] = useState<{ updated: number, failed: number, skipped: number }>({ updated: 0, failed: 0, skipped: 0 });

  // NEW: Fetch departments
  const { data: departments, isLoading: isLoadingDepartments } = useDepartments(currentCountry);

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
    { value: 'pending', label: 'Pending' },
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const categoryFilterOptions = [
    { value: 'all', label: 'All Categories' },
    ...categoryOptions.map(opt => ({ value: opt.value, label: opt.label }))
  ];

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      setFilterStatuses([statusParam as StandingOrder['status']]);
    } else {
      setFilterStatuses([]);
    }
    setCurrentPage(1);
  }, [searchParams]);

  const debounceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextFilterChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      setter(value);
      setCurrentPage(1);
    }, 700);
  }, []);

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
  const { data: standingOrders, isLoading: isStandingOrdersLoading, error: standingOrdersError, refetch } = useQuery<StandingOrder[]>({
    queryKey: ['standingOrders', currentCountry, filterPayee, filterCategories, filterStatuses, filterSku, filterPaymentReference, filterStartDate, filterEndDate, filterPaymentDay, sortColumn, sortDirection, currentPage, itemsPerPage, filterDateDiscrepancy],
    queryFn: async () => {
      if (!session) return [];

      const from = itemsPerPage === 'all' ? 0 : (currentPage - 1) * (itemsPerPage as number);
      const to = itemsPerPage === 'all' ? null : from + (itemsPerPage as number) - 1;

      let query = supabase
        .from('standing_orders')
        .select('*', { count: 'exact' });
      
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      if (filterPayee) query = query.ilike('payee', `%${filterPayee}%`);
      
      const nonAllStatuses = (filterStatuses as string[]).filter(s => s !== 'all');
      if (nonAllStatuses.length > 0) query = query.in('status', nonAllStatuses);

      const nonAllCategories = filterCategories.filter(c => c !== 'all');
      if (nonAllCategories.length > 0) {
        const categoryFilters = nonAllCategories.map(category => 
          `categories.cs.{"category":"${category}"}`
        ).join(',');
        query = query.or(categoryFilters);
      }

      if (filterStartDate) query = query.gte('payment_date', format(filterStartDate, 'yyyy-MM-dd'));
      if (filterEndDate) query = query.lte('payment_date', format(filterEndDate, 'yyyy-MM-dd'));
      
      if (filterSku) query = query.ilike('sku', `%${filterSku}%`);
      if (filterPaymentReference) query = query.ilike('payment_reference', `%${filterPaymentReference}%`);
      if (filterPaymentDay) query = query.eq('payment_day', filterPaymentDay);

      // Sorting
      if (sortColumn) query = query.order(sortColumn as string, { ascending: sortDirection === 'asc' });
      if (sortColumn !== 'created_at') query = query.order('created_at', { ascending: false });
      if (sortColumn !== 'id') query = query.order('id', { ascending: false });

      // Range
      // Only apply DB range if NOT filtering by date discrepancy client-side
      // When filtering by date discrepancy, we must fetch all records to check computed values
      if (itemsPerPage !== 'all' && !filterDateDiscrepancy) query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      // Client-side filter for Date Discrepancy (excluding verified items)
      let filteredData = data || [];
      if (filterDateDiscrepancy) {
        filteredData = filteredData.filter(order => {
          // If already checked/verified by admin, exclude from "Has Date Discrepancy" list
          if (order.agreement_end_date_checked) return false;

          if (!order.payment_end_date || !order.agreement_end_date) return false;
          const diff = Math.abs(differenceInDays(parseISO(order.payment_end_date), parseISO(order.agreement_end_date)));
          return diff > 15;
        });
        
        // Update total items count based on the full filtered list
        setTotalItems(filteredData.length); 
        
        // Manual Pagination Slicing for client-side filtered data
        if (itemsPerPage !== 'all') {
            const startIndex = (currentPage - 1) * (itemsPerPage as number);
            const endIndex = startIndex + (itemsPerPage as number);
            filteredData = filteredData.slice(startIndex, endIndex);
        }
      } else {
        setTotalItems(count || 0);
      }

      return filteredData;
    },
    enabled: !!session,
  });

  useEffect(() => {
    setSelectedStandingOrderIds([]);
  }, [standingOrders, currentPage]);

  const isAllSelected = (standingOrders?.length || 0) > 0 && selectedStandingOrderIds.length === (standingOrders?.length || 0);
  const handleToggleSelectAll = (checked: boolean) => {
    if (!standingOrders) return;
    setSelectedStandingOrderIds(checked ? standingOrders.map(o => o.id) : []);
  };
  const handleToggleSelect = (id: string, checked: boolean) => {
    setSelectedStandingOrderIds(prev => checked ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  };

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
    },
  });

  const deleteStandingOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('standing_orders').delete().eq('id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
      queryClient.invalidateQueries({ queryKey: ['pendingStandingOrders'] });
      showSuccess("Standing Order deleted successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete Standing Order.");
    },
  });

  // Toggle Checked Status Mutation
  const toggleCheckedMutation = useMutation({
    mutationFn: async ({ id, checked }: { id: string, checked: boolean }) => {
      const { error } = await supabase
        .from('standing_orders')
        .update({ agreement_end_date_checked: checked })
        .eq('id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update status.");
    },
  });

  const handleToggleChecked = (id: string, currentStatus: boolean | undefined) => {
    toggleCheckedMutation.mutate({ id, checked: !currentStatus });
  };

  // --- BULK SYNC LOGIC ---
  const handleBulkSync = async () => {
    setIsBulkSyncDialogOpen(true);
    setIsBulkSyncing(true);
    setSyncProgress(0);
    setBulkSyncResults({ updated: 0, failed: 0, skipped: 0 });

    try {
      // 1. Fetch all candidate Standing Orders (active/pending, with SKU)
      let query = supabase
        .from('standing_orders')
        .select('id, sku, agreement_end_date, agreement_end_date_checked')
        .not('sku', 'is', null)
        .neq('sku', '')
        .eq('not_property_related', false);
      
      if (currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data: candidates, error } = await query;
      if (error) throw error;

      if (!candidates || candidates.length === 0) {
        setSyncTotal(0);
        setIsBulkSyncing(false);
        return;
      }

      setSyncTotal(candidates.length);
      let updatedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      // 2. Iterate and process (using chunks/concurrency could be better, but sequential is safer for now)
      for (let i = 0; i < candidates.length; i++) {
        const order = candidates[i];
        try {
          const { data, error: fnError } = await supabase.functions.invoke('fetch-contract-end-date', {
            body: { sku: order.sku },
          });

          if (fnError || !data) {
            failedCount++;
          } else {
            // Determine new date value:
            // - If data.endDate exists, use it.
            // - If isExplicitlyEmpty is true, use null.
            
            let newDate: string | null = null;
            if (data.endDate) {
              newDate = data.endDate;
            } else if (data.isExplicitlyEmpty) {
              newDate = null;
            } else {
              // Failed to extract a date, and it wasn't explicitly empty
              skippedCount++;
              setSyncProgress(i + 1);
              continue;
            }

            const currentDate = order.agreement_end_date;

            // Check if value actually changed
            if (newDate !== currentDate) {
              // Update date AND uncheck validation box
              await supabase
                .from('standing_orders')
                .update({ 
                  agreement_end_date: newDate,
                  agreement_end_date_checked: false, // Auto-uncheck on change
                  agreement_end_date_checked_at: null, // Clear timestamp
                  agreement_end_date_checked_by: null, // Clear user
                  updated_at: new Date().toISOString()
                })
                .eq('id', order.id);
              updatedCount++;
            } else {
              skippedCount++;
            }
          }
        } catch (e) {
          console.error(`Error syncing SKU ${order.sku}:`, e);
          failedCount++;
        }

        setSyncProgress(i + 1);
      }

      setBulkSyncResults({ updated: updatedCount, failed: failedCount, skipped: skippedCount });
      showSuccess(`Bulk sync complete. Updated: ${updatedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
      queryClient.invalidateQueries({ queryKey: ['standingOrders'] });

    } catch (e: any) {
      showError("Bulk sync failed to start: " + e.message);
    } finally {
      setIsBulkSyncing(false);
    }
  };

  // ... (Sort/Filter/Pagination logic remains same) ...
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
    setFilterCategories([]);
    setFilterStatuses([]);
    setFilterSku('');
    setLocalFilterSku('');
    setFilterPaymentReference('');
    setLocalFilterPaymentReference('');
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setFilterPaymentDay(undefined);
    setFilterDateDiscrepancy(false);
    setCurrentPage(1);
    setSelectedStandingOrderIds([]);
    queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
  };

  const hasActiveFilters = filterPayee !== '' || filterCategories.length > 0 || filterStatuses.length > 0 || filterSku !== '' || filterPaymentReference !== '' || filterStartDate !== undefined || filterEndDate !== undefined || filterPaymentDay !== undefined || filterDateDiscrepancy;

  const getStatusBadge = (status: StandingOrder['status']) => {
    let className = '';
    switch (status) {
      case 'active': className = 'bg-green-500 text-green-50'; break;
      case 'paused': className = 'bg-yellow-500 text-yellow-50'; break;
      case 'cancelled': className = 'bg-red-500 text-red-50'; break;
      case 'pending': case 'awaiting_info': className = 'bg-orange-500 text-orange-50'; break;
      default: className = 'bg-gray-500 text-gray-50';
    }
    return (
      <Badge className={cn(className, "border border-white")}>
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

  // Export Logic
  const handleDownloadStandingOrders = () => {
    if (standingOrders) {
      const flattenedData = standingOrders.map(order => {
        const base = { ...order };
        delete (base as any).categories;
        order.categories.forEach((cat, index) => {
          (base as any)[`category_${index + 1}`] = categoryOptions.find(c => c.value === cat.category)?.label || cat.category;
          (base as any)[`amount_${index + 1}`] = cat.amount;
        });
        return base;
      });

      const dynamicCategoryHeaders: string[] = [];
      let maxCategories = 0;
      standingOrders.forEach(order => {
        if (order.categories.length > maxCategories) maxCategories = order.categories.length;
      });
      for (let i = 1; i <= maxCategories; i++) {
        dynamicCategoryHeaders.push(`category_${i}`);
        dynamicCategoryHeaders.push(`amount_${i}`);
      }

      const baseColumns = [
        'id', 'created_at', 'updated_at', 'requester_id', 'payee', 'payment_date',
        'sku', 'not_property_related', ...dynamicCategoryHeaders, 'total_amount', 'account_name', 'account_address',
        'iban_number', 'sort_code', 'account_number', 'from_day', 'to_day',
        'payment_reference', 'status', 'country', 'bank_details_verified', 'payment_day', 'currency', 'bank_account',
        'payment_end_date', 'agreement_end_date', 'agreement_end_date_checked'
      ];

      exportToCsv(
        flattenedData,
        `standing_orders_${currentCountry}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`,
        baseColumns as unknown as (keyof StandingOrder)[]
      );
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
      items.push(<PaginationItem key="1"><PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink></PaginationItem>);
      if (startPage > 2) items.push(<PaginationItem key="ellipsis-start"><PaginationEllipsis /></PaginationItem>);
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(<PaginationItem key={i}><PaginationLink isActive={i === currentPage} onClick={() => setCurrentPage(i)}>{i}</PaginationLink></PaginationItem>);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) items.push(<PaginationItem key="ellipsis-end"><PaginationEllipsis /></PaginationItem>);
      items.push(<PaginationItem key={totalPages}><PaginationLink onClick={() => setCurrentPage(totalPages)}>{totalPages}</PaginationLink></PaginationItem>);
    }
    return items;
  };

  if (isSessionLoading || isStandingOrdersLoading || isLoadingDepartments) {
    return <div className="flex items-center justify-center h-full text-lg">Loading standing orders...</div>;
  }

  if (!session) { navigate('/login'); return null; }
  if (standingOrdersError) return <div className="flex items-center justify-center h-full text-red-500">Error: {standingOrdersError.message}</div>;

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
                <>
                  <Button onClick={handleDownloadStandingOrders} className="shadow-sm" variant="outline">
                    <FileDown className="mr-2 h-4 w-4" /> Export
                  </Button>
                  <Button onClick={handleBulkSync} className="shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
                    <RefreshCw className="mr-2 h-4 w-4" /> Bulk Sync Dates
                  </Button>
                </>
              )}
              <div className="flex items-center gap-2">
                <label htmlFor="items-per-page" className="text-sm font-medium text-gray-700">Records:</label>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => {
                    const newItemsPerPage = value === 'all' ? 'all' : parseInt(value);
                    setItemsPerPage(newItemsPerPage);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger id="items-per-page" className="w-24">
                    <SelectValue />
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
              <Dialog open={isAddStandingOrderDialogOpen} onOpenChange={setIsAddStandingOrderDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="shadow-sm">
                    <PlusCircle className="mr-2 h-4 w-4" /> New Order
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Standing Order</DialogTitle>
                    <DialogDescription>Fill in the details to create a new recurring standing order.</DialogDescription>
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
                      <Trash2 className="mr-2 h-4 w-4" /> Delete ({selectedStandingOrderIds.length})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete selected standing orders?</AlertDialogTitle>
                      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMultipleStandingOrdersMutation.mutate(selectedStandingOrderIds)}
                        asChild
                      >
                        <Button variant="destructive">Confirm Delete</Button>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
          <CardDescription>Manage your recurring standing order payments.</CardDescription>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Payee</label>
                <Input placeholder="e.g., Landlord" value={localFilterPayee} onChange={(e) => { setLocalFilterPayee(e.target.value); handleTextFilterChange(setFilterPayee, e.target.value); }} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                <Input placeholder="e.g., RENT-001" value={localFilterSku} onChange={(e) => { setLocalFilterSku(e.target.value); handleTextFilterChange(setFilterSku, e.target.value); }} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Reference</label>
                <Input placeholder="e.g., RENT-JAN-2024" value={localFilterPaymentReference} onChange={(e) => { setLocalFilterPaymentReference(e.target.value); handleTextFilterChange(setFilterPaymentReference, e.target.value); }} />
              </div>
              <MultiSelectFilter label="Category" placeholder="Select Categories" options={categoryFilterOptions} selectedValues={filterCategories} onValueChange={(values) => { setFilterCategories(values); setCurrentPage(1); }} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Day</label>
                <Select value={filterPaymentDay?.toString() || 'all'} onValueChange={(value) => { setFilterPaymentDay(value === 'all' ? undefined : parseInt(value, 10)); setCurrentPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="All Days" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All Days</SelectItem>{Array.from({ length: 31 }, (_, i) => i + 1).map(day => (<SelectItem key={day} value={day.toString()}>Day {day}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <MultiSelectFilter label="Status" placeholder="Select Statuses" options={statusOptions} selectedValues={filterStatuses} onValueChange={(values) => { setFilterStatuses(values as StandingOrder['status'][]); setCurrentPage(1); }} />
              {/* NEW FILTER */}
              <div className="flex items-end">
                <div className="flex items-center space-x-2 border p-2 rounded-md bg-white w-full">
                  <Checkbox 
                    id="date-discrepancy" 
                    checked={filterDateDiscrepancy}
                    onCheckedChange={(checked) => {
                      setFilterDateDiscrepancy(checked as boolean);
                      setCurrentPage(1);
                    }}
                  />
                  <label htmlFor="date-discrepancy" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Has Date Discrepancy
                  </label>
                </div>
              </div>
              
              {hasActiveFilters && (
                <div className="col-span-full flex justify-end">
                  <Button variant="outline" onClick={clearFilters} className="flex items-center gap-1"><RotateCcw className="h-4 w-4" /> Clear Filters</Button>
                </div>
              )}
            </div>
          </div>

          {standingOrders && standingOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 th-resizable">
                      <Checkbox checked={isAllSelected} onCheckedChange={(checked) => handleToggleSelectAll(!!checked)} disabled={!isAdmin} />
                    </TableHead>
                    {/* NEW: Checked Status Column */}
                    {isAdmin && <TableHead className="w-12 text-center th-resizable">Checked</TableHead>}
                    <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('payee')}>Payee {renderSortIcon('payee')}</TableHead>
                    <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('sku')}>SKU {renderSortIcon('sku')}</TableHead>
                    <TableHead className="th-resizable w-[150px]">Property Address</TableHead>
                    <TableHead className="th-resizable">Categories</TableHead>
                    <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('total_amount')}>Amount {renderSortIcon('total_amount')}</TableHead>
                    <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('payment_date')}>Start Date {renderSortIcon('payment_date')}</TableHead>
                    <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('payment_end_date')}>
                        <div className="flex items-center">
                            End Date (Bank) {renderSortIcon('payment_end_date')}
                        </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('agreement_end_date')}>
                        <div className="flex items-center">
                            End Date (Contract) {renderSortIcon('agreement_end_date')}
                        </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary th-resizable" onClick={() => handleSort('status')}>Status {renderSortIcon('status')}</TableHead>
                    <TableHead className="text-right th-resizable">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {standingOrders.map((order) => {
                    // Update discrepancy logic: If checked, consider no discrepancy
                    const hasDiscrepancy = !order.agreement_end_date_checked && order.payment_end_date && order.agreement_end_date && Math.abs(differenceInDays(parseISO(order.payment_end_date), parseISO(order.agreement_end_date))) > 15;
                    return (
                      <TableRow key={order.id} className="hover:bg-gradient-to-r hover:from-dyad-blue-light/5 hover:to-background">
                        <TableCell>
                          <Checkbox checked={selectedStandingOrderIds.includes(order.id)} onCheckedChange={(checked) => handleToggleSelect(order.id, !!checked)} disabled={!isAdmin} />
                        </TableCell>
                        {isAdmin && (
                            <TableCell className="text-center">
                                <Checkbox 
                                    checked={order.agreement_end_date_checked || false} 
                                    onCheckedChange={(checked) => handleToggleChecked(order.id, order.agreement_end_date_checked)}
                                />
                            </TableCell>
                        )}
                        <TableCell className="font-medium">{order.payee}</TableCell>
                        <TableCell>{order.not_property_related ? 'N/A' : (order.sku || 'N/A')}</TableCell>
                        <TableCell>{order.not_property_related ? 'N/A' : getAddressFromSku(order.sku)}</TableCell>
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
                        <TableCell>
                            <div className="flex items-center gap-2">
                                {order.agreement_end_date ? format(new Date(order.agreement_end_date), 'PPP') : 'N/A'}
                                {hasDiscrepancy && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <AlertTriangle className="h-4 w-4 text-red-500 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Discrepancy detected: Contract end date differs from Bank end date by {Math.abs(differenceInDays(parseISO(order.payment_end_date!), parseISO(order.agreement_end_date!)))} days.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                            </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end space-y-1">
                            <Button variant="outline" size="sm" className="shadow-sm w-full" onClick={() => navigate(`/standing-order/${order.id}`)}>
                              <Eye className="h-4 w-4 mr-2" /> View
                            </Button>
                            {isAdmin && (
                              <Button variant="outline" size="sm" className="shadow-sm w-full" onClick={() => { setEditingStandingOrder(order); setIsEditStandingOrderDialogOpen(true); }}>
                                <Edit className="h-4 w-4 mr-2" /> Edit
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground mt-8">No standing orders found matching your criteria.</p>
          )}
          {itemsPerPage !== 'all' && totalPages > 1 && (
            <Pagination className="mt-4">
              <PaginationContent>
                <PaginationItem><PaginationPrevious onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} /></PaginationItem>
                {renderPaginationItems()}
                <PaginationItem><PaginationNext onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} /></PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </CardContent>
      </Card>

      {/* Bulk Sync Progress Dialog */}
      <Dialog open={isBulkSyncDialogOpen} onOpenChange={setIsBulkSyncDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isBulkSyncing ? "Syncing Agreement Dates..." : "Sync Complete"}</DialogTitle>
            <DialogDescription>
              {isBulkSyncing 
                ? "Checking external system for contract end dates. Please wait." 
                : "Results of the bulk synchronization process."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {isBulkSyncing ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Processing...</span>
                  <span>{syncProgress} / {syncTotal}</span>
                </div>
                {/* Fallback progress bar visual since shadcn/ui Progress component might not be fully configured in every environment setup */}
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${(syncProgress / syncTotal) * 100}%` }} />
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-green-600 flex items-center"><CheckSquare className="h-4 w-4 mr-2" /> Updated: {bulkSyncResults.updated}</p>
                <p className="text-gray-600 flex items-center"><Square className="h-4 w-4 mr-2" /> Skipped (No Change): {bulkSyncResults.skipped}</p>
                <p className="text-red-600 flex items-center"><AlertTriangle className="h-4 w-4 mr-2" /> Failed: {bulkSyncResults.failed}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsBulkSyncDialogOpen(false)} disabled={isBulkSyncing}>
              {isBulkSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingStandingOrder && (
        <Dialog open={isEditStandingOrderDialogOpen} onOpenChange={setIsEditStandingOrderDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Standing Order: {editingStandingOrder.payee}</DialogTitle>
            </DialogHeader>
            <UpdateStandingOrderForm key={editingStandingOrder.id} standingOrder={editingStandingOrder} onStandingOrderUpdated={handleStandingOrderUpdated} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default StandingOrders;