"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'; // Import useMutation
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
import { PlusCircle, Filter, XCircle, Clock, Euro, CheckCircle, MessageSquare, Ban, FileX, Search, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react'; // Import AlertTriangle icon
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DatePicker from '@/components/DatePicker';
import { Card, CardContent, CardHeader, CardTitle }
from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch'; // Import Switch component

// Define a union type for search results
type SearchResult = (PaymentRequest & { type: 'payment_request' }) | (Transaction & { type: 'transaction' });

const Dashboard = () => {
  const { session, isLoading, user, userProfile } = useSession(); // Use userProfile from context
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const userRole = userProfile?.role || null;

  // Filter states for the table
  const [filterSupplierName, setFilterSupplierName] = useState('');
  const [filterSkuNumber, setFilterSkuNumber] = useState('');
  const [filterStatus, setFilterStatus] = useState<PaymentRequest['status'] | 'all'>('all');
  const [filterDatePaymentRequired, setFilterDatePaymentRequired] = useState<Date | undefined>(undefined);

  // Sorting states for the table
  const [sortColumn, setSortColumn] = useState<keyof PaymentRequest | null>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Global Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Debounce for text inputs (filters and global search)
  const debounceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextFilterChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      console.log(`[Dashboard] Debounced filter update for: ${value}`);
      setter(value);
    }, 500); // Increased debounce to 500ms
  }, []);

  // Effect to debounce global search term
  useEffect(() => {
    const handler = setTimeout(() => {
      console.log(`[Dashboard] Debounced global search term: ${searchTerm}`);
      setDebouncedSearchTerm(searchTerm);
    }, 700); // Increased debounce to 700ms for global search

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);


  // Effect to read URL parameters for initial filter state
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam && (statusParam === 'pending' || statusParam === 'setup_awaiting_approval' || statusParam === 'approved' || statusParam === 'declined' || statusParam === 'queried' || statusParam === 'all')) {
      setFilterStatus(statusParam);
    } else if (location.pathname === '/admin/requests') {
      // If on admin requests page but no status param, default to 'pending'
      setFilterStatus('pending');
    } else {
      // For requester's personal dashboard, default to 'pending'
      setFilterStatus('pending');
    }
    // Note: We don't clear searchParams here so direct links with filters work.
  }, [searchParams, location.pathname]);


  // Determine if we are on the 'All Requests' page
  const isAllRequestsPage = location.pathname === '/admin/requests';
  // Determine if it's a requester's personal dashboard
  const isRequesterPersonalDashboard = userRole === 'requester' && location.pathname === '/dashboard';

  // --- Data for Summary Cards (Global Totals) ---
  const allPaymentRequestsForSummaryQuery = useQuery<PaymentRequest[]>({
    queryKey: ['allPaymentRequestsForSummary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_requests')
        .select('*'); // No requester_id filter here
      if (error) throw error;
      return data;
    },
    enabled: !!session && !debouncedSearchTerm, // Enabled for any approved user, only if no search term
  });

  const allMissingReceiptsCountForSummaryQuery = useQuery<number>({
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
    enabled: !!session && !debouncedSearchTerm, // Enabled for any approved user, only if no search term
  });

  // Calculate counts for summary cards
  const counts = useMemo(() => {
    const initialCounts = {
      pending: 0,
      setup_awaiting_approval: 0,
      approved: 0,
      declined: 0,
      queried: 0,
      missing_receipts: allMissingReceiptsCountForSummaryQuery.data || 0,
      total: 0,
    };

    if (allPaymentRequestsForSummaryQuery.data) {
      allPaymentRequestsForSummaryQuery.data.forEach(request => {
        if (request.status in initialCounts) {
          initialCounts[request.status as keyof typeof initialCounts]++;
        }
        initialCounts.total++;
      });
    }
    return initialCounts;
  }, [allPaymentRequestsForSummaryQuery.data, allMissingReceiptsCountForSummaryQuery.data]);


  // --- Data for Table Display (Conditional) ---
  const { data: paymentRequestsForTable, isLoading: isRequestsTableLoading, error: requestsError } = useQuery<PaymentRequest[]>({
    queryKey: ['paymentRequestsForTable', user?.id, userRole, filterSupplierName, filterSkuNumber, filterStatus, filterDatePaymentRequired, isAllRequestsPage, isRequesterPersonalDashboard, sortColumn, sortDirection],
    queryFn: async () => {
      if (!user?.id || !userRole || debouncedSearchTerm) return []; // Do not fetch if global search is active

      let query = supabase.from('payment_requests').select('*');

      if (isRequesterPersonalDashboard) {
        // For a requester's personal dashboard, only show their pending requests
        query = query.eq('requester_id', user.id).eq('status', 'pending');
      } else if (isAllRequestsPage) {
        // For the 'All Requests' page, show all requests and apply filters
        if (filterSupplierName) {
          query = query.ilike('supplier_name', `%${filterSupplierName}%`);
        }
        if (filterSkuNumber) {
          query = query.ilike('sku_number', `%${filterSkuNumber}%`);
        }
        // Apply filterStatus, which defaults to 'pending' if not set by URL
        if (filterStatus !== 'all') {
          query = query.eq('status', filterStatus);
        }
        if (filterDatePaymentRequired) {
          query = query.gte('date_payment_required', format(filterDatePaymentRequired, 'yyyy-MM-dd'));
        }
      }
      // If it's an admin on /dashboard, no requester_id filter is applied, so they see all requests by default.

      // Apply primary sort for urgency, then dynamic sorting
      query = query.order('is_urgent', { ascending: false }); // Urgent requests first
      if (sortColumn) {
        query = query.order(sortColumn, { ascending: sortDirection === 'asc' });
      }
      // Add secondary and tertiary sorts for stability, ensuring 'id' is always the final tie-breaker
      if (sortColumn !== 'created_at') { // Only add if not already sorting by created_at
        query = query.order('created_at', { ascending: false });
      }
      if (sortColumn !== 'id') { // Only add if not already sorting by id
        query = query.order('id', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!userRole && !debouncedSearchTerm, // Enabled only if no global search term
  });

  // --- Global Search Query ---
  const { data: searchResults, isLoading: isSearchLoading, error: searchError } = useQuery<SearchResult[]>({
    queryKey: ['globalSearch', debouncedSearchTerm],
    queryFn: async () => {
      if (!debouncedSearchTerm) return [];

      const term = `%${debouncedSearchTerm}%`;
      const searchPromises: Promise<any>[] = [];

      // Search Payment Requests
      searchPromises.push(
        supabase
          .from('payment_requests')
          .select('*')
          .or(`supplier_name.ilike.${term},sku_number.ilike.${term},supplier_address.ilike.${term},iban_number.ilike.${term},currency.ilike.${term},reason_for_payment.ilike.${term},admin_action_reason.ilike.${term}`)
          .then(({ data, error }) => {
            if (error) {
              console.error("Error searching payment requests:", error);
              return [];
            }
            return data ? data.map(item => ({ ...item, type: 'payment_request' })) : [];
          })
      );

      // Search Missing Receipts (Transactions)
      searchPromises.push(
        supabase
          .from('transactions')
          .select('*')
          .eq('status', 'pending_input') // Only missing receipts
          .eq('receipt_urls', '{}') // Only missing receipts
          .or(`description.ilike.${term},type.ilike.${term},entry.ilike.${term},bank.ilike.${term},contra_account.ilike.${term},currency.ilike.${term},comment.ilike.${term},sku.ilike.${term},reason_for_payment.ilike.${term},category.ilike.${term},merchant_name.ilike.${term},notes.ilike.${term}`)
          .then(({ data, error }) => {
            if (error) {
              console.error("Error searching transactions:", error);
              return [];
            }
            return data ? data.map(item => ({ ...item, type: 'transaction' })) : [];
          })
      );

      const results = await Promise.all(searchPromises);
      return results.flat();
    },
    enabled: !!debouncedSearchTerm && !!session, // Only run if there's a search term and session
  });

  // Mutation for toggling urgent status
  const toggleUrgentMutation = useMutation({
    mutationFn: async ({ id, is_urgent }: { id: string; is_urgent: boolean }) => {
      if (!user?.id) throw new Error("User not authenticated.");
      const { error } = await supabase
        .from('payment_requests')
        .update({ is_urgent: is_urgent, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] });
      queryClient.invalidateQueries({ queryKey: ['allPaymentRequestsForSummary'] });
      showSuccess(`Request marked as ${variables.is_urgent ? 'urgent' : 'not urgent'}!`);
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update urgent status.");
      console.error("Toggle urgent status error:", error);
    },
  });

  const handleToggleUrgent = async (requestId: string, currentUrgentStatus: boolean) => {
    const toastId = showLoading(currentUrgentStatus ? "Removing urgent status..." : "Marking as urgent...");
    try {
      await toggleUrgentMutation.mutateAsync({ id: requestId, is_urgent: !currentUrgentStatus });
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };


  const clearFilters = () => {
    setFilterSupplierName('');
    setFilterSkuNumber('');
    // When clearing filters, reset status to 'pending' for dashboard, 'all' for admin/requests
    setFilterStatus(isAllRequestsPage ? 'pending' : 'pending');
    setFilterDatePaymentRequired(undefined);
    setSearchParams({}); // Clear URL search params
    queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] }); // Force refetch
  };

  const handleSort = (column: keyof PaymentRequest) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc'); // Default to ascending when changing column
    }
  };

  const renderSortIcon = (column: keyof PaymentRequest) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
    }
    return null;
  };

  const hasActiveFilters = filterSupplierName !== '' || filterSkuNumber !== '' || filterStatus !== 'pending' || filterDatePaymentRequired !== undefined;

  if (isLoading || allPaymentRequestsForSummaryQuery.isLoading || allMissingReceiptsCountForSummaryQuery.isLoading || isRequestsTableLoading || isSearchLoading) {
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

  if (searchError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error during search: {searchError.message}</div>;
  }

  const getStatusBadge = (status: PaymentRequest['status'] | Transaction['status']) => {
    let displayText = status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.replace(/_/g, ' ').slice(1);
    let className = '';

    switch (status) {
      case 'pending':
      case 'pending_input':
        className = 'bg-yellow-500 text-yellow-50';
        break;
      case 'setup_awaiting_approval':
        displayText = 'Payment Setup';
        className = 'bg-blue-500 text-blue-50';
        break;
      case 'approved':
      case 'completed':
        displayText = status === 'approved' ? 'Payment Complete' : 'Receipt Added';
        className = 'bg-green-500 text-green-50';
        break;
      case 'declined':
        className = 'bg-red-500 text-red-50';
        break;
      case 'queried':
        className = 'bg-gray-500 text-gray-50';
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

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">
          {debouncedSearchTerm ? `Search Results for "${debouncedSearchTerm}"` : (isAllRequestsPage ? 'All Payment Requests' : 'My Pending Requests')}
        </h1>
        {(userRole === 'requester' || userRole === 'admin') && (
          <Button onClick={() => navigate('/new-request')} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground" size="lg">
            <PlusCircle className="mr-2 h-5 w-5" />
            Create New Request
          </Button>
        )}
      </div>

      {/* Global Search Input */}
      <div className="mb-8 flex items-center gap-2">
        <Input
          placeholder="Search all requests and missing receipts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        {searchTerm && (
          <Button variant="outline" onClick={() => setSearchTerm('')} className="flex items-center gap-1">
            <XCircle className="h-4 w-4" /> Clear Search
          </Button>
        )}
      </div>

      {debouncedSearchTerm ? (
        // Display Search Results
        <div className="overflow-x-auto">
          {searchResults && searchResults.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description / Supplier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchResults.map((item) => (
                  <TableRow
                    key={item.id}
                    className="transition-all duration-200 ease-in-out hover:bg-gradient-to-r hover:from-dyad-blue-light hover:to-dyad-blue/10"
                  >
                    <TableCell>
                      <Badge variant="outline" className="bg-gray-100 text-gray-800">
                        {item.type === 'payment_request' ? 'Payment Request' : 'Missing Receipt'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.type === 'payment_request' ? item.supplier_name : item.description}
                    </TableCell>
                    <TableCell>
                      {item.currency} {item.type === 'payment_request' ? item.payment_amount?.toFixed(2) : item.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(item.status)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(item.type === 'payment_request' ? item.date_payment_required : item.transaction_date), 'PPP')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link to={item.type === 'payment_request' ? `/request/${item.id}` : `/transaction/${item.id}`}>
                          View Details
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground mt-8">No results found for "{debouncedSearchTerm}".</p>
          )}
        </div>
      ) : (
        <>
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
                onChange={(e) => handleTextFilterChange(setFilterSupplierName, e.currentTarget.value)}
                className="max-w-xs"
              />
              <Input
                placeholder="Filter by SKU Number"
                value={filterSkuNumber}
                onChange={(e) => handleTextFilterChange(setFilterSkuNumber, e.currentTarget.value)}
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
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('supplier_name')}>
                      <div className="flex items-center">
                        Supplier Name {renderSortIcon('supplier_name')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('sku_number')}>
                      <div className="flex items-center">
                        SKU Number {renderSortIcon('sku_number')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('date_payment_required')}>
                      <div className="flex items-center">
                        Payment Required {renderSortIcon('date_payment_required')}
                      </div>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('created_at')}>
                      <div className="flex items-center">
                        Created At {renderSortIcon('created_at')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payment_setup_date')}>
                      <div className="flex items-center">
                        Payment Setup Date {renderSortIcon('payment_setup_date')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort('payment_approved_date')}>
                      <div className="flex items-center">
                        Payment Approved Date {renderSortIcon('payment_approved_date')}
                      </div>
                    </TableHead>
                    {userRole === 'admin' && <TableHead className="text-center">Urgent</TableHead>} {/* New Urgent column header */}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentRequestsForTable.map((request) => (
                    <TableRow
                      key={request.id}
                      className={cn(
                        "transition-all duration-200 ease-in-out hover:bg-gradient-to-r hover:from-dyad-blue-light hover:to-dyad-blue/10",
                        request.is_urgent && "bg-red-600 text-white hover:bg-red-700" // Highlight urgent requests with solid red
                      )}
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
                      {userRole === 'admin' && (
                        <TableCell className="text-center">
                          <Switch
                            checked={request.is_urgent}
                            onCheckedChange={() => handleToggleUrgent(request.id, request.is_urgent)}
                            disabled={toggleUrgentMutation.isPending}
                            aria-label={`Toggle urgent status for ${request.supplier_name}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className={cn(
                            request.is_urgent && "text-gray-900 hover:text-white hover:bg-red-800 border-gray-900" // Explicitly set text color for urgent rows
                          )}
                        >
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
        </>
      )}
    </div>
  );
};

export default Dashboard;