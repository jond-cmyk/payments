"use client";

import React, { useState, useCallback } from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { StandingOrder } from '@/types/supabase'; // Import StandingOrder type
import { format } from 'date-fns';
import { Repeat, PlusCircle, Filter, RotateCcw, ArrowUp, ArrowDown, Edit, Trash2, Eye } from 'lucide-react'; // Import Eye icon
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';

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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'; // Import Dialog components
import AddStandingOrderForm from '@/components/standing-orders/AddStandingOrderForm'; // Import the new form
import EditStandingOrderForm from '@/components/standing-orders/EditStandingOrderForm'; // Import the new form
import { cn } from '@/lib/utils';
import CountrySelector from '@/components/CountrySelector'; // Import CountrySelector

const StandingOrders = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddStandingOrderDialogOpen, setIsAddStandingOrderDialogOpen] = useState(false);
  const [isEditStandingOrderDialogOpen, setIsEditStandingOrderDialogOpen] = useState(false);
  const [editingStandingOrder, setEditingStandingOrder] = useState<StandingOrder | null>(null);

  // Filter states
  const [filterPayee, setFilterPayee] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPaymentDate, setFilterPaymentDate] = useState<Date | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<StandingOrder['status'] | 'all'>('all');

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
    }, 500);
  }, []);

  const isAdmin = userProfile?.role === 'admin';

  // Fetch Standing Orders
  const { data: standingOrders, isLoading: isStandingOrdersLoading, error: standingOrdersError } = useQuery<StandingOrder[]>({
    queryKey: ['standingOrders', currentCountry, filterPayee, filterCategory, filterPaymentDate, filterStatus, sortColumn, sortDirection],
    queryFn: async () => {
      if (!session) return [];

      let query = supabase
        .from('standing_orders')
        .select('*');
      
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
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      // Apply sorting
      if (sortColumn) {
        query = query.order(sortColumn, { ascending: sortDirection === 'asc' });
      }
      // Add secondary and tertiary sorts for stability
      if (sortColumn !== 'created_at') {
        query = query.order('created_at', { ascending: false });
      }
      if (sortColumn !== 'id') {
        query = query.order('id', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;
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
  };

  const renderSortIcon = (column: keyof StandingOrder) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
    }
    return null;
  };

  const clearFilters = () => {
    setFilterPayee('');
    setFilterCategory('all');
    setFilterPaymentDate(undefined);
    setFilterStatus('all');
    queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
  };

  const hasActiveFilters = filterPayee !== '' || filterCategory !== 'all' || filterPaymentDate !== undefined || filterStatus !== 'all';

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
  };

  const handleEditClick = (standingOrder: StandingOrder) => {
    setEditingStandingOrder(standingOrder);
    setIsEditStandingOrderDialogOpen(true);
  };

  const handleStandingOrderUpdated = () => {
    setIsEditStandingOrderDialogOpen(false);
    setEditingStandingOrder(null);
    queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
    queryClient.invalidateQueries({ queryKey: ['standingOrder', editingStandingOrder?.id] }); // Invalidate detail page query
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
            <Dialog open={isAddStandingOrderDialogOpen} onOpenChange={setIsAddStandingOrderDialogOpen}>
              <DialogTrigger asChild>
                <Button className="shadow-sm">
                  <PlusCircle className="mr-2 h-4 w-4" /> Add New Standing Order
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto"> {/* Adjusted max-w-lg */}
                <DialogHeader>
                  <DialogTitle>Add New Standing Order</DialogTitle>
                </DialogHeader>
                <AddStandingOrderForm onStandingOrderAdded={handleStandingOrderAdded} />
              </DialogContent>
            </Dialog>
          </div>
          <CardDescription>
            Manage your recurring standing order payments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-4 p-4 border rounded-md bg-gray-50 shadow-sm">
            <span className="font-medium text-gray-700">Filters:</span>
            {isAdmin && <CountrySelector className="w-[240px]" triggerClassName="w-full" />} {/* Country Selector for Admins */}
            <Input
              placeholder="Filter by Payee"
              value={filterPayee}
              onChange={(e) => handleTextFilterChange(setFilterPayee, e.target.value)}
              className="max-w-xs shadow-sm"
            />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px] shadow-sm">
                <SelectValue placeholder="Filter by Category" />
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
            <DatePicker
              date={filterPaymentDate}
              setDate={setFilterPaymentDate}
              placeholder="Filter by Payment Date"
              className="w-[200px] shadow-sm"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px] shadow-sm">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="flex items-center gap-1 shadow-sm">
                <RotateCcw className="h-4 w-4" /> Clear Filters
              </Button>
            )}
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
                    <TableHead>Payment Reference</TableHead>
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
                      <TableCell>{order.payment_reference}</TableCell>
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
        </CardContent>
      </Card>

      {editingStandingOrder && (
        <Dialog open={isEditStandingOrderDialogOpen} onOpenChange={setIsEditStandingOrderDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto"> {/* Adjusted max-w-lg */}
            <DialogHeader>
              <DialogTitle>Edit Standing Order: {editingStandingOrder.payee}</DialogTitle>
            </DialogHeader>
            <EditStandingOrderForm standingOrder={editingStandingOrder} onStandingOrderUpdated={handleStandingOrderUpdated} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default StandingOrders;