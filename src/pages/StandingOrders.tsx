"use client";

import React, { useState, useCallback } from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { StandingOrder } from '@/types/supabase'; // Import StandingOrder type
import { format } from 'date-fns';
import { Repeat, PlusCircle, Filter, RotateCcw, ArrowUp, ArrowDown, Edit, Trash2 } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import CountrySelector from '@/components/CountrySelector'; // Import CountrySelector

// Placeholder for AddStandingOrderForm - will be created if user requests
const AddStandingOrderForm = ({ onStandingOrderAdded }: { onStandingOrderAdded: () => void }) => (
  <div className="p-4 text-center">
    <p className="text-muted-foreground">Form to add a new standing order will go here.</p>
    <Button onClick={onStandingOrderAdded} className="mt-4">Close Form</Button>
  </div>
);

const StandingOrders = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddStandingOrderDialogOpen, setIsAddStandingOrderDialogOpen] = useState(false);

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

  // Fetch Standing Orders (placeholder query)
  const { data: standingOrders, isLoading: isStandingOrdersLoading, error: standingOrdersError } = useQuery<StandingOrder[]>({
    queryKey: ['standingOrders', currentCountry, filterPayee, filterCategory, filterPaymentDate, filterStatus, sortColumn, sortDirection],
    queryFn: async () => {
      if (!session) return [];

      // This is a placeholder. Replace with actual Supabase query for 'standing_orders' table.
      // For now, it returns dummy data.
      console.log(`[StandingOrders Query] Fetching with filters: country=${currentCountry}, payee=${filterPayee}, category=${filterCategory}, date=${filterPaymentDate?.toISOString().split('T')[0]}, status=${filterStatus}, sortColumn=${sortColumn}, sortDirection=${sortDirection}`);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));

      const dummyData: StandingOrder[] = [
        { id: 'so1', created_at: '2023-01-15T10:00:00Z', updated_at: '2023-01-15T10:00:00Z', requester_id: 'user1', payee: 'Rent Co.', payment_date: '2024-03-01', sku: 'CH123', not_property_related: false, category: '950_rent', account_number: '123456789', payment_reference: 'SO-RENT-001', status: 'active', country: 'Switzerland' },
        { id: 'so2', created_at: '2023-02-20T11:00:00Z', updated_at: '2023-02-20T11:00:00Z', requester_id: 'user2', payee: 'Internet Provider', payment_date: '2024-03-05', sku: null, not_property_related: true, category: '958_internet', account_number: '987654321', payment_reference: 'SO-INT-002', status: 'paused', country: 'Switzerland' },
        { id: 'so3', created_at: '2023-03-10T12:00:00Z', updated_at: '2023-03-10T12:00:00Z', requester_id: 'user1', payee: 'Electricity Bill', payment_date: '2024-03-10', sku: 'UK456', not_property_related: false, category: '952_utilities_el', account_number: '112233445', payment_reference: 'SO-EL-003', status: 'active', country: 'United Kingdom' },
        { id: 'so4', created_at: '2023-04-01T09:00:00Z', updated_at: '2023-04-01T09:00:00Z', requester_id: 'user3', payee: 'Cleaning Services', payment_date: '2024-03-15', sku: null, not_property_related: true, category: '960_cleaning_services', account_number: '556677889', payment_reference: 'SO-CLEAN-004', status: 'active', country: 'Switzerland' },
      ];

      let filteredData = dummyData;

      // Apply country filter
      if (userProfile?.role === 'requester' && userProfile.country) {
        filteredData = filteredData.filter(so => so.country === userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        filteredData = filteredData.filter(so => so.country === currentCountry);
      }

      // Apply other filters
      if (filterPayee) {
        filteredData = filteredData.filter(so => so.payee.toLowerCase().includes(filterPayee.toLowerCase()));
      }
      if (filterCategory !== 'all') {
        filteredData = filteredData.filter(so => so.category === filterCategory);
      }
      if (filterPaymentDate) {
        filteredData = filteredData.filter(so => so.payment_date === format(filterPaymentDate, 'yyyy-MM-dd'));
      }
      if (filterStatus !== 'all') {
        filteredData = filteredData.filter(so => so.status === filterStatus);
      }

      // Apply sorting
      if (sortColumn) {
        filteredData.sort((a, b) => {
          const aValue = a[sortColumn];
          const bValue = b[sortColumn];

          if (typeof aValue === 'string' && typeof bValue === 'string') {
            return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
          }
          if (typeof aValue === 'number' && typeof bValue === 'number') {
            return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
          }
          // Fallback for other types or nulls
          return 0;
        });
      }

      return filteredData;
    },
    enabled: !!session,
  });

  const deleteStandingOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      // Placeholder for actual delete logic
      console.log(`[StandingOrders] Deleting standing order with ID: ${id}`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API call
      // Replace with actual Supabase delete:
      // const { error } = await supabase.from('standing_orders').delete().eq('id', id);
      // if (error) throw error;
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
              <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
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
                      <TableCell>{order.account_number}</TableCell>
                      <TableCell>{order.payment_reference}</TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell className="text-right flex items-center justify-end space-x-2">
                        {isAdmin && (
                          <Button variant="outline" size="sm" className="shadow-sm">
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
    </div>
  );
};

export default StandingOrders;