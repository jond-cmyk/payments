"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ArrowUp, ArrowDown, FileDown } from 'lucide-react';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import DashboardSummaryCards from '@/components/dashboard/DashboardSummaryCards';
import PaymentRequestFilters from '@/components/dashboard/PaymentRequestFilters';
import PaymentRequestTable from '@/components/dashboard/PaymentRequestTable';
import PendingStandingOrderTable from '@/components/dashboard/PendingStandingOrderTable';
import RecentActivityFeed from '@/components/dashboard/RecentActivityFeed';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { supabase } from '@/integrations/supabase/client';
import { PaymentRequest, Profile, Transaction, StandingOrder, DirectDebit } from '@/types/supabase';
import { format } from 'date-fns';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { exportToCsv } from '@/utils/exportToCsv';

interface DashboardMainContentProps {
  debouncedSearchTerm: string;
}

const ITEMS_PER_PAGE = 10;

const DashboardMainContent: React.FC<DashboardMainContentProps> = ({ debouncedSearchTerm }) => {
  const { session, user, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const userRole = userProfile?.role || null;

  // Filter states for the table
  const [filterSupplierName, setFilterSupplierName] = useState('');
  const [filterSkuNumber, setFilterSkuNumber] = useState('');
  const [filterStatus, setFilterStatus] = useState<PaymentRequest['status'] | 'all'>('all');
  const [filterDatePaymentRequired, setFilterDatePaymentRequired] = useState<Date | undefined>(undefined);
  const [filterRequester, setFilterRequester] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(undefined);
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(undefined);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Sorting states for the table
  const [sortColumn, setSortColumn] = useState<keyof PaymentRequest | null>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Debounce for text inputs (filters)
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextFilterChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      console.log(`[DashboardMainContent] Debounced filter update for: ${value}`);
      setter(value);
      setCurrentPage(1); // Reset to first page on filter change
    }, 500);
  }, []);

  // Effect to read URL parameters for initial filter state
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam && (statusParam === 'pending' || statusParam === 'setup_awaiting_approval' || statusParam === 'approved' || statusParam === 'declined' || statusParam === 'queried' || statusParam === 'all')) {
      setFilterStatus(statusParam);
    } else if (location.pathname === '/admin/requests') {
      setFilterStatus('all');
    } else {
      setFilterStatus('pending');
    }
    setCurrentPage(1); // Reset page when URL params change
  }, [searchParams, location.pathname]);

  // Determine if we are on the 'All Requests' page
  const isAllRequestsPage = location.pathname === '/admin/requests';

  // --- Data for Summary Cards (Global Totals) ---
  const allPaymentRequestsForSummaryQuery = useQuery<PaymentRequest[]>({
    queryKey: ['allPaymentRequestsForSummary', currentCountry],
    queryFn: async () => {
      let query = supabase
        .from('payment_requests')
        .select('*');
      
      // Admins see all countries in summary, requesters see only their country
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        // If admin and a specific country is selected, filter by it
        query = query.eq('country', currentCountry);
      }
      // If admin and currentCountry is 'all', no country filter is applied, showing all countries

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!session && !debouncedSearchTerm,
  });

  const allMissingReceiptsCountForSummaryQuery = useQuery<number>({
    queryKey: ['allMissingReceiptsCountForSummary', currentCountry],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('id', { count: 'exact' })
        .eq('status', 'pending_input')
        .eq('receipt_urls', '{}');

      // Admins see all countries in summary, requesters see only their country
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        // If admin and a specific country is selected, filter by it
        query = query.eq('country', currentCountry);
      }
      // If admin and currentCountry is 'all', no country filter is applied, showing all countries

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!session && !debouncedSearchTerm,
  });

  // NEW: Fetch count of pending standing orders for summary card
  const allPendingStandingOrdersCountForSummaryQuery = useQuery<number>({
    queryKey: ['allPendingStandingOrdersCountForSummary', currentCountry],
    queryFn: async () => {
      let query = supabase
        .from('standing_orders')
        .select('id', { count: 'exact' })
        .eq('status', 'pending');

      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!session && !debouncedSearchTerm,
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
      pending_standing_orders: allPendingStandingOrdersCountForSummaryQuery.data || 0,
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
  }, [allPaymentRequestsForSummaryQuery.data, allMissingReceiptsCountForSummaryQuery.data, allPendingStandingOrdersCountForSummaryQuery.data]);

  // Fetch all user profiles for the requester dropdown filter
  const { data: allProfiles, isLoading: isProfilesLoading, error: profilesError } = useQuery<Profile[]>({
    queryKey: ['allProfilesForFilter', currentCountry],
    queryFn: async () => {
      let query = supabase
        .from('profile_with_email')
        .select('id, first_name, last_name, user_email, role, is_approved, avatar_url, updated_at, country');
      
      // Filter profiles by selected country if not 'all'
      if (currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!session && isAllRequestsPage,
  });

  // --- Data for Table Display (Conditional) ---
  const { data: paymentRequestsForTable, isLoading: isRequestsTableLoading, error: requestsError } = useQuery<
    (PaymentRequest & { requester_profile: { first_name: string | null } | null })[]
  >({
    queryKey: ['paymentRequestsForTable', user?.id, userRole, filterSupplierName, filterSkuNumber, filterStatus, filterDatePaymentRequired, filterRequester, filterStartDate, filterEndDate, isAllRequestsPage, sortColumn, sortDirection, currentCountry, currentPage],
    queryFn: async () => {
      if (!user?.id || !userRole || debouncedSearchTerm) return [];

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase.from('payment_requests').select('*, requester_profile:profiles(first_name)', { count: 'exact' });

      // Apply country filter based on user role and selected country
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      // Define all possible statuses for the 'All Requests' page when filterStatus is 'all'
      const allPossibleStatuses: PaymentRequest['status'][] = ['pending', 'setup_awaiting_approval', 'approved', 'declined', 'queried'];
      // Define common active statuses for the main dashboard
      const activeDashboardStatuses: PaymentRequest['status'][] = ['pending', 'setup_awaiting_approval', 'queried'];


      if (isAllRequestsPage) {
        // Admin's 'All Requests' page: apply filters
        if (filterSupplierName) {
          query = query.ilike('supplier_name', `%${filterSupplierName}%`);
        }
        if (filterSkuNumber) {
          query = query.ilike('sku_number', `%${filterSkuNumber}%`);
        }
        if (filterStatus !== 'all') {
          query = query.eq('status', filterStatus);
        } else {
          // FIX: When filterStatus is 'all', include all possible statuses
          query = query.in('status', allPossibleStatuses); 
        }
        if (filterDatePaymentRequired) {
          query = query.gte('date_payment_required', format(filterDatePaymentRequired, 'yyyy-MM-dd'));
        }
        // NEW: Apply date range filters
        if (filterStartDate) {
          query = query.gte('date_payment_required', format(filterStartDate, 'yyyy-MM-dd'));
        }
        if (filterEndDate) {
          query = query.lte('date_payment_required', format(filterEndDate, 'yyyy-MM-dd'));
        }
        if (filterRequester !== 'all') {
          query = query.eq('requester_id', filterRequester);
        }
      } else { // This is the main dashboard view (for both requester and admin)
        // Filter by active statuses AND (is_urgent OR is_reminded)
        query = query.in('status', activeDashboardStatuses)
                     .or('is_urgent.eq.true,is_reminded.eq.true');
      }

      // Always sort urgent requests to the top, then reminded, then by the selected column
      query = query.order('is_urgent', { ascending: false });
      query = query.order('is_reminded', { ascending: false });
      if (sortColumn) {
        query = query.order(sortColumn as string, { ascending: sortDirection === 'asc' });
      }
      // Add secondary and tertiary sorts for stability
      if (sortColumn !== 'created_at') {
        query = query.order('created_at', { ascending: false });
      }
      if (sortColumn !== 'id') {
        query = query.order('id', { ascending: false });
      }

      query = query.range(from, to); // Apply pagination range

      const { data, error, count } = await query;
      if (error) throw error;
      setTotalItems(count || 0); // Set total items for pagination
      return data;
    },
    enabled: !!user?.id && !!userRole && !debouncedSearchTerm,
  });

  // Mutation for toggling urgent status
  const toggleUrgentMutation = useMutation({
    mutationFn: async ({ id, is_urgent }: { id: string; is_urgent: boolean }) => {
      if (!user?.id) throw new Error("User not authenticated.");
      const { error } = await supabase
        .from('payment_requests')
        .update({ is_urgent: is_urgent, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('country', currentCountry);
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
    setFilterStatus('all');
    setFilterDatePaymentRequired(undefined);
    setFilterRequester('all');
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setSearchParams({});
    setCurrentPage(1); // Reset page on clear filters
    queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] });
  };

  const handleSort = (column: keyof PaymentRequest) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset to first page on sort change
  };

  const renderSortIcon = (column: keyof PaymentRequest) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
    }
    return null;
  };

  const hasActiveFilters = filterSupplierName !== '' || filterSkuNumber !== '' || filterDatePaymentRequired !== undefined || filterStatus !== 'all' || filterRequester !== 'all' || filterStartDate !== undefined || filterEndDate !== undefined;

  const getStatusBadge = (status: PaymentRequest['status'] | Transaction['status'] | StandingOrder['status'] | DirectDebit['status'], itemType?: 'payment_request' | 'transaction' | 'standing_order' | 'direct_debit') => {
    let displayText = status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.replace(/_/g, ' ').slice(1);
    let className = '';

    switch (status) {
      case 'pending':
        if (itemType === 'standing_order' || itemType === 'direct_debit') {
          className = 'bg-orange-500 text-orange-50';
        } else { // Default for payment_request
          className = 'bg-yellow-500 text-yellow-50';
        }
        break;
      case 'pending_input':
        className = 'bg-yellow-500 text-yellow-50';
        displayText = 'Missing Receipt';
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
      case 'active': // For Direct Debits and Standing Orders
        className = 'bg-green-500 text-green-50';
        break;
      case 'paused': // For Direct Debits and Standing Orders
        className = 'bg-yellow-500 text-yellow-50';
        break;
      case 'cancelled': // For Direct Debits and Standing Orders
        className = 'bg-red-500 text-red-50';
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return <Badge className={cn(className, "border border-white")}>{displayText}</Badge>; // Added white border
  };

  // Define columns for Payment Request export
  const paymentRequestExportColumns: (keyof PaymentRequest)[] = [
    'id', 'created_at', 'updated_at', 'requester_id', 'supplier_name', 'sku_number',
    'not_sku_related', 'lease_id', 'supplier_address', 'iban_number', 'sort_code',
    'account_number', 'bank_account_name', 'currency', 'payment_amount',
    'reason_for_payment', 'date_payment_required', 'invoice_pdf_urls', 'status',
    'admin_action_by', 'admin_action_reason', 'receipt_pdf_url', 'payment_setup_date',
    'payment_approved_date', 'receipt_required', 'is_urgent', 'country',
    'last_reminder_sent_at', 'is_reminded', 'category', 'bank_details_verified'
  ];

  const handleDownloadPaymentRequests = () => {
    if (paymentRequestsForTable) {
      exportToCsv(paymentRequestsForTable, `payment_requests_${currentCountry}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`, paymentRequestExportColumns);
    }
  };

  if (allPaymentRequestsForSummaryQuery.isLoading || allMissingReceiptsCountForSummaryQuery.isLoading || allPendingStandingOrdersCountForSummaryQuery.isLoading || isRequestsTableLoading || (isAllRequestsPage && isProfilesLoading)) {
    return <div className="flex items-center justify-center h-full text-lg">Loading dashboard content...</div>;
  }

  if (requestsError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading requests: ${requestsError.message}</div>;
  }

  if (profilesError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading profiles for filter: ${profilesError.message}</div>;
  }

  // Check if there are any urgent requests in the table data to conditionally show the title
  const hasUrgentRequests = paymentRequestsForTable?.some(req => req.is_urgent);
  const hasRemindedRequests = paymentRequestsForTable?.some(req => req.is_reminded);

  return (
    <>
      {/* Summary cards always show on /dashboard for both requester and admin */}
      {!isAllRequestsPage && (
        <DashboardSummaryCards counts={counts} />
      )}

      {/* New title for Priority Payment Requests, shown only if there are urgent or reminded requests */}
      {!isAllRequestsPage && (hasUrgentRequests || hasRemindedRequests) && (
        <h2 className="text-2xl font-bold mb-4 mt-8">Priority Payment Requests</h2>
      )}

      {/* Filters only show on /admin/requests */}
      {isAllRequestsPage && (
        <PaymentRequestFilters
          filterSupplierName={filterSupplierName}
          setFilterSupplierName={(value) => handleTextFilterChange(setFilterSupplierName, value)}
          filterSkuNumber={filterSkuNumber}
          setFilterSkuNumber={(value) => handleTextFilterChange(setFilterSkuNumber, value)}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterDatePaymentRequired={filterDatePaymentRequired}
          setFilterDatePaymentRequired={(date) => { setFilterDatePaymentRequired(date); setCurrentPage(1); }}
          filterRequester={filterRequester}
          setFilterRequester={setFilterRequester}
          filterStartDate={filterStartDate}
          setFilterStartDate={(date) => { setFilterStartDate(date); setCurrentPage(1); }}
          filterEndDate={filterEndDate}
          setFilterEndDate={(date) => { setFilterEndDate(date); setCurrentPage(1); }}
          allProfiles={allProfiles}
          clearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          handleTextFilterChange={handleTextFilterChange}
        />
      )}

      {paymentRequestsForTable && paymentRequestsForTable.length > 0 ? (
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-bold">
              {isAllRequestsPage ? 'All Payment Requests' : 'Priority Payment Requests'}
            </CardTitle>
            {userRole === 'admin' && (
              <Button onClick={handleDownloadPaymentRequests} className="shadow-sm" variant="outline">
                <FileDown className="mr-2 h-4 w-4" /> Download to Excel
              </Button>
            )}
          </CardHeader>
          <PaymentRequestTable
            paymentRequests={paymentRequestsForTable}
            userRole={userRole}
            handleSort={handleSort}
            renderSortIcon={renderSortIcon}
            getStatusBadge={(status, itemType) => getStatusBadge(status, itemType)}
            handleToggleUrgent={handleToggleUrgent}
            toggleUrgentMutation={toggleUrgentMutation}
            currentPage={currentPage}
            itemsPerPage={ITEMS_PER_PAGE}
            totalItems={totalItems}
            onPageChange={setCurrentPage}
          />
        </Card>
      ) : (
        <p className="text-center text-muted-foreground mt-8">
          No priority payment requests found.
        </p>
      )}

      {/* NEW: Pending Standing Orders Table, shown only on dashboard and if there are pending orders */}
      {!isAllRequestsPage && <PendingStandingOrderTable />}

      {/* NEW: Recent Activity Feed, shown only on dashboard and if no search term */}
      {!isAllRequestsPage && !debouncedSearchTerm && <RecentActivityFeed />}
    </>
  );
};

export default DashboardMainContent;