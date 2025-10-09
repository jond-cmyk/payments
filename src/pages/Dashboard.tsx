"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PaymentRequest, Profile } from '@/types/supabase';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { PlusCircle, Filter, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DatePicker from '@/components/DatePicker';

const Dashboard = () => {
  const { session, isLoading, user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [userRole, setUserRole] = useState<Profile['role'] | null>(null);

  // Filter states
  const [filterSupplierName, setFilterSupplierName] = useState('');
  const [filterSkuNumber, setFilterSkuNumber] = useState('');
  const [filterStatus, setFilterStatus] = useState<PaymentRequest['status'] | 'all'>('all');
  const [filterDatePaymentRequired, setFilterDatePaymentRequired] = useState<Date | undefined>(undefined);

  // Debounce for text inputs
  const debounceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextFilterChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      setter(value);
    }, 300); // 300ms debounce
  }, []);

  // Fetch user role
  const { data: profileData, isLoading: isProfileLoading, error: profileError } = useQuery<Profile | null>({
    queryKey: ['userProfile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (error) {
        console.error("Error fetching user profile:", error);
        throw error;
      }
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (profileData) {
      setUserRole(profileData.role);
    }
  }, [profileData]);

  const isAdminView = userRole === 'admin' && location.pathname === '/admin/requests';

  // Fetch payment requests based on role and filters
  const { data: paymentRequests, isLoading: isRequestsLoading, error: requestsError } = useQuery<PaymentRequest[]>({
    queryKey: ['paymentRequests', user?.id, userRole, filterSupplierName, filterSkuNumber, filterStatus, filterDatePaymentRequired],
    queryFn: async () => {
      if (!user?.id || !userRole) return [];

      let query = supabase.from('payment_requests').select('*');

      if (userRole === 'requester') {
        query = query.eq('requester_id', user.id);
      } else if (isAdminView) {
        // Apply admin filters
        if (filterSupplierName) {
          query = query.ilike('supplier_name', `%${filterSupplierName}%`);
        }
        if (filterSkuNumber) {
          query = query.ilike('sku_number', `%${filterSkuNumber}%`);
        }
        if (filterStatus !== 'all') {
          query = query.eq('status', filterStatus);
        }
        if (filterDatePaymentRequired) {
          query = query.gte('date_payment_required', format(filterDatePaymentRequired, 'yyyy-MM-dd'));
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!userRole,
  });

  const clearFilters = () => {
    setFilterSupplierName('');
    setFilterSkuNumber('');
    setFilterStatus('all');
    setFilterDatePaymentRequired(undefined);
    queryClient.invalidateQueries({ queryKey: ['paymentRequests'] }); // Force refetch
  };

  if (isLoading || isProfileLoading || isRequestsLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading dashboard...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (profileError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading user profile: {profileError.message}</div>;
  }

  if (requestsError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading requests: {requestsError.message}</div>;
  }

  const getStatusBadge = (status: PaymentRequest['status']) => {
    let displayText = status.charAt(0).toUpperCase() + status.slice(1);
    let className = '';

    switch (status) {
      case 'pending':
        className = 'bg-yellow-500 text-yellow-50';
        break;
      case 'setup_awaiting_approval':
        displayText = 'Payment Setup';
        className = 'bg-blue-500 text-blue-50';
        break;
      case 'approved':
        displayText = 'Payment Complete';
        className = 'bg-green-500 text-green-50';
        break;
      case 'declined':
        className = 'bg-red-500 text-red-50';
        break;
      case 'queried':
        className = 'bg-orange-500 text-orange-50';
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return <Badge className={className}>{displayText}</Badge>;
  };

  const hasActiveFilters = filterSupplierName !== '' || filterSkuNumber !== '' || filterStatus !== 'all' || filterDatePaymentRequired !== undefined;

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">
          {isAdminView ? 'All Payment Requests' : 'My Payment Requests'}
        </h1>
        {userRole === 'requester' && (
          <Button onClick={() => navigate('/new-request')} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground">
            <PlusCircle className="mr-2 h-4 w-4" />
            Create New Request
          </Button>
        )}
      </div>

      {isAdminView && (
        <div className="mb-4 flex flex-wrap items-center gap-4 p-4 border rounded-md bg-gray-50">
          <span className="font-medium text-gray-700">Filters:</span>
          <Input
            placeholder="Filter by Supplier Name"
            value={filterSupplierName}
            onChange={(e) => setFilterSupplierName(e.target.value)}
            onKeyUp={(e) => handleTextFilterChange(setFilterSupplierName, e.currentTarget.value)}
            className="max-w-xs"
          />
          <Input
            placeholder="Filter by SKU Number"
            value={filterSkuNumber}
            onChange={(e) => setFilterSkuNumber(e.target.value)}
            onKeyUp={(e) => handleTextFilterChange(setFilterSkuNumber, e.currentTarget.value)}
            className="max-w-xs"
          />
          <Select value={filterStatus} onValueChange={(value: PaymentRequest['status'] | 'all') => setFilterStatus(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="setup_awaiting_approval">Payment Setup</SelectItem>
              <SelectItem value="approved">Payment Complete</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
              <SelectItem value="queried">Queried</SelectItem>
            </SelectContent>
          </Select>
          <DatePicker
            date={filterDatePaymentRequired}
            setDate={setFilterDatePaymentRequired}
            placeholder="Filter by Payment Date"
            className="w-[200px]"
          />
          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters} className="flex items-center gap-1">
              <XCircle className="h-4 w-4" /> Clear Filters
            </Button>
          )}
        </div>
      )}

      {paymentRequests && paymentRequests.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier Name</TableHead>
                <TableHead>SKU Number</TableHead>
                <TableHead>Payment Required</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Payment Setup Date</TableHead> {/* New TableHead */}
                <TableHead>Payment Approved Date</TableHead> {/* New TableHead */}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">{request.supplier_name}</TableCell>
                  <TableCell>{request.sku_number}</TableCell>
                  <TableCell>{format(new Date(request.date_payment_required), 'PPP')}</TableCell>
                  <TableCell>
                    {getStatusBadge(request.status)}
                  </TableCell>
                  <TableCell>{format(new Date(request.created_at), 'PPP')}</TableCell>
                  <TableCell>
                    {request.payment_setup_date ? format(new Date(request.payment_setup_date), 'PPP') : 'N/A'}
                  </TableCell> {/* New TableCell */}
                  <TableCell>
                    {request.payment_approved_date ? format(new Date(request.payment_approved_date), 'PPP') : 'N/A'}
                  </TableCell> {/* New TableCell */}
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/request/${request.id}`}>View Details</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-center text-muted-foreground mt-8">
          {userRole === 'requester' ? 'You have not created any payment requests yet.' : 'No payment requests found matching your criteria.'}
        </p>
      )}
    </div>
  );
};

export default Dashboard;