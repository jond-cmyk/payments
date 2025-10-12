"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PaymentRequest, Profile, Transaction } from '@/types/supabase'; // Import Transaction type
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
import { PlusCircle, Filter, XCircle, Clock, Euro, CheckCircle, MessageSquare, Ban, FileX } from 'lucide-react'; // Import FileX icon
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DatePicker from '@/components/DatePicker';
import { Card, CardContent, CardHeader, CardTitle }
from '@/components/ui/card';
import { cn } from '@/lib/utils';

const Dashboard = () => {
  const { session, isLoading, user, userProfile } = useSession(); // Use userProfile from context
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const userRole = userProfile?.role || null; // Get role directly from userProfile

  // Filter states for the table
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

  // Effect to read URL parameters for initial filter state
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam && (statusParam === 'pending' || statusParam === 'setup_awaiting_approval' || statusParam === 'approved' || statusParam === 'declined' || statusParam === 'queried' || statusParam === 'all')) {
      setFilterStatus(statusParam);
    } else if (location.pathname === '/admin/requests') {
      // If on admin requests page but no status param, default to 'all'
      setFilterStatus('all');
    } else {
      // For other pages (like requester dashboard), ensure filter is 'all'
      setFilterStatus('all');
    }
    // Note: We don't clear searchParams here so direct links with filters work.
  }, [searchParams, location.pathname]);


  // Determine if we are on the 'All Requests' page
  const isAllRequestsPage = location.pathname === '/admin/requests';
  // Determine if it's a requester's personal dashboard
  const isRequesterPersonalDashboard = userRole === 'requester' && location.pathname === '/dashboard';

  // --- Data for Summary Cards (Global Totals) ---
  const { data: allPaymentRequestsForSummary, isLoading: isAllRequestsSummaryLoading } = useQuery<PaymentRequest[]>({
    queryKey: ['allPaymentRequestsForSummary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_requests')
        .select('*'); // No requester_id filter here
      if (error) throw error;
      return data;
    },
    enabled: !!session, // Enabled for any approved user
  });

  const { data: allMissingReceiptsCountForSummary, isLoading: isAllMissingReceiptsSummaryLoading } = useQuery<number>({
    queryKey: ['allMissingReceiptsCountForSummary'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('transactions')
        .select('id', { count: 'exact' })
        .eq('status', 'pending_input')
        .eq('receipt_urls', '{}'); // No requester_id filter here
      if (error) throw error;
      return count || 0;
    },
    enabled: !!session, // Enabled for any approved user
  });

  // --- Data for Table Display (Conditional) ---
  const { data: paymentRequestsForTable, isLoading: isRequestsTableLoading, error: requestsError } = useQuery<PaymentRequest[]>({
    queryKey: ['paymentRequestsForTable', user?.id, userRole, filterSupplierName, filterSkuNumber, filterStatus, filterDatePaymentRequired, isAllRequestsPage, isRequesterPersonalDashboard],
    queryFn: async () => {
      if (!user?.id || !userRole) return [];

      let query = supabase.from('payment_requests').select('*');

      if (isRequesterPersonalDashboard) {
        // For a requester's personal dashboard, only show their requests
        query = query.eq('requester_id', user.id);
      } else if (isAllRequestsPage) {
        // For the 'All Requests' page, show all requests and apply filters
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
      // If it's an admin on /dashboard, no requester_id filter is applied, so they see all requests by default.

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
    setSearchParams({}); // Clear URL search params
    queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] }); // Force refetch
  };

  // Calculate counts for summary cards using global data
  const counts = React.useMemo(() => {
    if (!allPaymentRequestsForSummary) {
      return {
        pending: 0,
        setup_awaiting_approval: 0,
        queried: 0,
        declined: 0,
        approved: 0,
        total: 0,
        missing_receipts: allMissingReceiptsCountForSummary || 0,
      };
    }

    const initialCounts = {
      pending: 0,
      setup_awaiting_approval: 0,
      queried: 0,
      declined: 0,
      approved: 0,
    };

    allPaymentRequestsForSummary.forEach(request => {
      if (request.status in initialCounts) {
        initialCounts[request.status as keyof typeof initialCounts]++;
      }
    });

    return {
      ...initialCounts,
      total: allPaymentRequestsForSummary.length,
      missing_receipts: allMissingReceiptsCountForSummary || 0,
    };
  }, [allPaymentRequestsForSummary, allMissingReceiptsCountForSummary]);


  if (isLoading || isAllRequestsSummaryLoading || isAllMissingReceiptsSummaryLoading || isRequestsTableLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading dashboard...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (!userProfile) {
    return <div className="flex items-center justify-center h-red-500">Error loading user profile.</div>;
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
        className = 'bg-gray-500 text-gray-50'; // Changed to text-gray-600
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return <Badge className={className}>{displayText}</Badge>;
  };

  // Helper to get card specific styling based on status
  const getCardStyling = (status: PaymentRequest['status'] | 'missing_receipts') => {
    switch (status) {
      case 'pending':
        return {
          borderClass: 'border-yellow-500',
          textClass: 'text-yellow-600',
          icon: <Clock className="h-4 w-4" />,
          title: 'Pending',
          description: 'Requests awaiting review',
          statusValue: 'pending',
          link: `/admin/requests?status=pending`,
        };
      case 'setup_awaiting_approval':
        return {
          borderClass: 'border-blue-500',
          textClass: 'text-blue-600',
          icon: <Euro className="h-4 w-4" />,
          title: 'Payment Setup',
          description: 'Payments being processed',
          statusValue: 'setup_awaiting_approval',
          link: `/admin/requests?status=setup_awaiting_approval`,
        };
      case 'queried':
        return {
          borderClass: 'border-gray-400', // Changed to grey border
          textClass: 'text-gray-700', // Changed to grey text
          icon: <MessageSquare className="h-4 w-4" />,
          title: 'Queried',
          description: 'Requests needing more info',
          statusValue: 'queried',
          link: `/admin/requests?status=queried`,
        };
      case 'declined':
        return {
          borderClass: 'border-red-500',
          textClass: 'text-red-600',
          icon: <Ban className="h-4 w-4" />,
          title: 'Declined',
          description: 'Requests that were rejected',
          statusValue: 'declined',
          link: `/admin/requests?status=declined`,
        };
      case 'approved':
        return {
          borderClass: 'border-green-500',
          textClass: 'text-green-600',
          icon: <CheckCircle className="h-4 w-4" />,
          title: 'Approved',
          description: 'Payments completed',
          statusValue: 'approved',
          link: `/admin/requests?status=approved`,
        };
      case 'missing_receipts':
        return {
          borderClass: 'border-orange-500',
          textClass: 'text-orange-600',
          icon: <FileX className="h-4 w-4" />,
          title: 'Missing Receipts',
          description: 'Transactions awaiting receipts',
          statusValue: 'missing_receipts',
          link: `/missing-receipts`, // Link to the missing receipts page
        };
      default:
        return {
          borderClass: 'border-gray-300',
          textClass: 'text-gray-600',
          icon: null,
          title: 'Unknown',
          description: '',
          statusValue: 'all',
          link: '#',
        };
    }
  };

  const hasActiveFilters = filterSupplierName !== '' || filterSkuNumber !== '' || filterStatus !== 'all' || filterDatePaymentRequired !== undefined;

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">
          {isAllRequestsPage ? 'All Payment Requests' : 'My Payment Requests'}
        </h1>
        {(userRole === 'requester' || userRole === 'admin') && (
          <Button onClick={() => navigate('/new-request')} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground" size="lg">
            <PlusCircle className="mr-2 h-5 w-5" />
            Create New Request
          </Button>
        )}
      </div>

      {/* Summary Cards - Only show if not on the 'All Requests' page */}
      {!isAllRequestsPage && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
          {Object.keys(counts).filter(key => key !== 'total').map((statusKey) => {
            const status = statusKey as PaymentRequest['status'] | 'missing_receipts';
            const { borderClass, textClass, icon, title, description, link } = getCardStyling(status);
            return (
              <Link key={status} to={link} className="block">
                <Card className={cn("border-l-4 cursor-pointer hover:shadow-lg transition-shadow", borderClass)}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className={cn("text-sm font-medium", textClass)}>{title}</CardTitle>
                    <span className={textClass}>{icon}</span>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{counts[status]}</div>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Filters - Show if on the 'All Requests' page */}
      {isAllRequestsPage && (
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

      {/* Table - Show if on the 'All Requests' page OR if it's a requester's personal dashboard */}
      {(isAllRequestsPage || isRequesterPersonalDashboard) && paymentRequestsForTable && paymentRequestsForTable.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier Name</TableHead>
                <TableHead>SKU Number</TableHead>
                <TableHead>Payment Required</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Payment Setup Date</TableHead>
                <TableHead>Payment Approved Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentRequestsForTable.map((request) => (
                <TableRow
                  key={request.id}
                  className="transition-all duration-200 ease-in-out hover:bg-gradient-to-r hover:from-dyad-blue-light hover:to-dyad-blue/10"
                >
                  <TableCell className="font-medium">{request.supplier_name}</TableCell>
                  <TableCell>{request.sku_number}</TableCell>
                  <TableCell>{format(new Date(request.date_payment_required), 'PPP')}</TableCell>
                  <TableCell>
                    {getStatusBadge(request.status)}
                  </TableCell>
                  <TableCell>{format(new Date(request.created_at), 'PPP')}</TableCell>
                  <TableCell>
                    {request.payment_setup_date ? format(new Date(request.payment_setup_date), 'PPP') : 'N/A'}
                  </TableCell>
                  <TableCell>
                    {request.payment_approved_date ? format(new Date(request.payment_approved_date), 'PPP') : 'N/A'}
                  </TableCell>
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
        // Conditional message based on whether it's the 'All Requests' page or requester's dashboard
        (isAllRequestsPage || isRequesterPersonalDashboard) ? (
          <p className="text-center text-muted-foreground mt-8">No payment requests found matching your criteria.</p>
        ) : (
          <p className="text-center text-muted-foreground mt-8">
            You can view your payment requests on the "All Requests" page.
          </p>
        )
      )}
    </div>
  );
};

export default Dashboard;