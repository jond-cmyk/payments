"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { StandingOrder } from '@/types/supabase';
import { format } from 'date-fns';
import { Repeat, PlusCircle, Filter, RotateCcw, ArrowUp, ArrowDown, Edit, Trash2, Eye, FileDown } from 'lucide-react';
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

  // Local states for immediate input feedback
  const [localFilterPayee, setLocalFilterPayee] = useState<string>('');
  const [localFilterSku, setLocalFilterSku] = useState<string>('');
  const [localFilterPaymentReference, setLocalFilterPaymentReference] = useState<string>('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

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
  const [sortColumn, setSortColumn] = useState<keyof StandingOrder | null>('payment_date');
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

  // Fetch Standing Orders
  const { data: standingOrders, isLoading: isStandingOrdersLoading, error: standingOrdersError } = useQuery<StandingOrder[]>({
    queryKey: ['standingOrders', currentCountry, filterPayee, filterCategory, filterPaymentDate, filterStatus, filterSku, filterPaymentReference, filterStartDate, filterEndDate, sortColumn, sortDirection, currentPage],
    queryFn: async () => {
      if (!session) return [];

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

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

      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      setTotalItems(count || 0);
      return data;
    },
    enabled: !!session,
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
    setCurrentPage(1);
    queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
  };

  const hasActiveFilters = filterPayee !== '' || filterCategory !== 'all' || filterPaymentDate !== undefined || filterStatus !== 'all' || filterSku !== '' || filterPaymentReference !== '' || filterStartDate !== undefined || filterEndDate !== undefined;

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
      <Badge className={cn(className, "transform translate-x-0 translate-y-0")}>
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
    'sku', 'not_property_related', 'category', 'account_name', 'account_address',
    'iban_number', 'sort_code', 'account_number', 'from_day', 'to_day',
    'payment_reference', 'status', 'country', 'bank_details_verified'
  ];

  const handleDownloadStandingOrders = () => {
    if (standingOrders) {
      exportToCsv(standingOrders, `standing_orders_${currentCountry}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`, standingOrderExportColumns);
    }
  };

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

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
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('category')}>
                      <div className="flex items-center">
                        Category {renderSortIcon('category')}
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
                      <TableCell className="font-medium">{order.payee}</TableCell>
                      <TableCell>{format(new Date(order.payment_date), 'PPP')}</TableCell>
                      <TableCell>
                        {order.not_property_related ? 'N/A (Not Property Related)' : (order.sku || 'N/A')}
                      </TableCell>
                      <TableCell>{categoryOptions.find(c => c.value === order.category)?.label || order.category}</TableCell>
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