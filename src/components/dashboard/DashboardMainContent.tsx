"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ArrowUp, ArrowDown, FileDown } from 'lucide-react';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import DashboardSummaryGroups from '@/components/dashboard/DashboardSummaryGroups';
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
import { categoryOptions } from '@/lib/constants'; // Import categoryOptions
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDepartments } from '@/hooks/useDepartments';

interface DashboardMainContentProps {
  debouncedSearchTerm: string;
  itemsPerPage: number | 'all';
  currentPage: number;
  setCurrentPage: (page: number) => void;
  viewMode: 'my' | 'all';
}

const DashboardMainContent: React.FC<DashboardMainContentProps> = ({
  debouncedSearchTerm,
  itemsPerPage,
  currentPage,
  setCurrentPage,
  viewMode,
}) => {
  const { session, user, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const userRole = userProfile?.role || null;

  // Filter states for the table
  const [filterSupplierName, setFilterSupplierName] = useState('');
  const [filterSkuNumber, setFilterSkuNumber] = useState('');
  const [filterStatuses, setFilterStatuses] = useState<PaymentRequest['status'][]>([]); // CHANGED: Array state
  const [filterDatePaymentRequired, setFilterDatePaymentRequired] = useState<Date | undefined>(undefined);
  const [filterRequesters, setFilterRequesters] = useState<string[]>([]); // CHANGED: Array state
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(undefined);
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(undefined);

  // Pagination states
  const [totalItems, setTotalItems] = useState(0);

  // Sorting states for the table
  const [sortColumn, setSortColumn] = useState<keyof PaymentRequest | null>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Debounce for text inputs (filters)
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // NEW: Fetch departments for address lookup
  const { data: departments, isLoading: isLoadingDepartments } = useDepartments(currentCountry);

  // Shared debounce function for all text inputs
  const handleTextFilterChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      console.log(`[DashboardMainContent] Debounced filter update for: ${value}`);
      setter(value);
      setCurrentPage(1); // Reset to first page on filter change
    }, 700); // Increased debounce time to 700ms
  }, [setCurrentPage]);

  // Define all possible statuses for filtering
  const allPossibleStatuses: PaymentRequest['status'][] = ['pending', 'setup_awaiting_approval', 'approved', 'declined', 'queried', 'cancelled', 'paused'];
  const activeDashboardStatuses: PaymentRequest['status'][] = ['pending', 'setup_awaiting_approval', 'queried'];

  // Effect to read URL parameters for initial filter state
  useEffect(() => {
    const statusParams = searchParams.getAll('status');
    if (statusParams.length > 0) {
      setFilterStatuses(statusParams as PaymentRequest['status'][]);
    } else if (location.pathname === '/admin/requests') {
      // Default for All Requests page: show ALL statuses, but have no filter selected initially
      setFilterStatuses([]);
    } else {
      // Default for Dashboard: select only active statuses
      setFilterStatuses(activeDashboardStatuses);
    }
    setCurrentPage(1); // Reset page when URL params change
  }, [searchParams, location.pathname, setCurrentPage]);

  // Determine if we are on the 'All Requests' page
  const isAllRequestsPage = location.pathname === '/admin/requests';

  // --- Data for Summary Cards (Global Totals) ---
  const allPaymentRequestsForSummaryQuery = useQuery<PaymentRequest[]>({
    queryKey: ['allPaymentRequestsForSummary', currentCountry, userRole, viewMode],
    queryFn: async () => {
      let query = supabase
        .from('payment_requests')
        .select('*');
      
      if (userProfile?.role === 'requester' && viewMode === 'my' && user) {
        query = query.eq('requester_id', user.id);
      } else if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!session && !debouncedSearchTerm,
  });

  const allMissingReceiptsCountForSummaryQuery = useQuery<number>({
    queryKey: ['allMissingReceiptsCountForSummary', currentCountry, userRole, viewMode],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('id', { count: 'exact' })
        .eq('status', 'pending_input')
        .eq('receipt_urls', '{}');

      if (userProfile?.role === 'requester' && viewMode === 'my' && user) {
        query = query.eq('requester_id', user.id);
      } else if (userProfile?.role === 'requester' && userProfile.country) {
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
      urgent_pending: 0,
      setup_awaiting_approval: 0,
      urgent_setup_awaiting_approval: 0,
      approved: 0,
      declined: 0,
      queried: 0,
      paused: 0,
      missing_receipts: allMissingReceiptsCountForSummaryQuery.data || 0,
      total: 0,
    };

    if (allPaymentRequestsForSummaryQuery.data) {
      allPaymentRequestsForSummaryQuery.data.forEach(request => {
        if (request.status in initialCounts) {
          initialCounts[request.status as keyof typeof initialCounts]++;
          if (request.is_urgent) {
            if (request.status === 'pending') {
              initialCounts.urgent_pending++;
            }
            if (request.status === 'setup_awaiting_approval') {
              initialCounts.urgent_setup_awaiting_approval++;
            }
          }
        }
        initialCounts.total++;
      });
    }
    
    const finalCounts = {
      ...initialCounts,
      queried_and_paused: initialCounts.queried + initialCounts.paused,
    };

    return finalCounts;
  }, [
    allPaymentRequestsForSummaryQuery.data, 
    allMissingReceiptsCountForSummaryQuery.data, 
  ]);

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

  const tableQueryKey = ['paymentRequestsForTable', user?.id, userRole, filterSupplierName, filterSkuNumber, filterStatuses, filterDatePaymentRequired, filterRequesters, filterStartDate, filterEndDate, isAllRequestsPage, sortColumn, sortDirection, currentCountry, currentPage, itemsPerPage, viewMode];

  // --- Data for Table Display (Conditional) ---
  const { data: paymentRequestsForTable, isLoading: isRequestsTableLoading, error: requestsError } = useQuery<
    (PaymentRequest & { requester_profile: { first_name: string | null, last_name: string | null } | null })[]
  >({
    queryKey: tableQueryKey,
    queryFn: async () => {
      if (!user?.id || !userRole || debouncedSearchTerm) return [];

      const from = itemsPerPage === 'all' ? 0 : (currentPage - 1) * (itemsPerPage as number);
      const to = itemsPerPage === 'all' ? null : from + (itemsPerPage as number) - 1;

      let query = supabase.from('payment_requests').select('*, requester_profile:profiles!requester_id(first_name, last_name)', { count: 'exact' });

      // Apply country filter based on user role and selected country
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      // Apply viewMode filter for requesters on the main dashboard
      if (userRole === 'requester' && !isAllRequestsPage && viewMode === 'my') {
        query = query.eq('requester_id', user.id);
      }

      // Determine which statuses to filter by
      let statusesToFilter: PaymentRequest['status'][] = [];
      if (isAllRequestsPage) {
        // Admin's 'All Requests' page: use filterStatuses state
        const nonAllStatuses = (filterStatuses as string[]).filter(s => s !== 'all');
        statusesToFilter = nonAllStatuses as PaymentRequest['status'][];
      } else { 
        // Main dashboard view: use activeDashboardStatuses
        statusesToFilter = activeDashboardStatuses;
      }

      // Apply filters
      if (isAllRequestsPage) {
        if (filterSupplierName) {
          query = query.ilike('supplier_name', `%${filterSupplierName}%`);
        }
        if (filterSkuNumber) {
          query = query.ilike('sku_number', `%${filterSkuNumber}%`);
        }
        
        // Only apply status filter if statusesToFilter is NOT empty
        if (statusesToFilter.length > 0) {
          query = query.in('status', statusesToFilter);
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
        if (filterRequesters.length > 0 && !(filterRequesters as string[]).includes('all')) {
          query = query.in('requester_id', filterRequesters);
        }
      } else { // This is the main dashboard view (for both requester and admin)
        // Filter by (active statuses OR (is_reminded AND not declined) OR (is_urgent AND not approved/declined))
        const statusFilter = `status.in.("${statusesToFilter.join('","')}")`;
        const urgentFilter = `and(is_urgent.eq.true,status.neq.approved,status.neq.declined)`; // Exclude approved and declined
        const remindedFilter = `and(is_reminded.eq.true,status.neq.declined)`; // Exclude declined
        
        query = query.or(`${statusFilter},${remindedFilter},${urgentFilter}`);
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

      if (itemsPerPage !== 'all') {
        query = query.range(from, to);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setTotalItems(count || 0);
      return data;
    },
    enabled: !!user?.id && !!userRole && !debouncedSearchTerm,
  });

  // Mutation for toggling urgent status with optimistic updates
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
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: tableQueryKey });
      const previousData = queryClient.getQueryData(tableQueryKey);
      queryClient.setQueryData(tableQueryKey, (oldData: any) => {
        if (!oldData) return oldData;
        return oldData.map((req: PaymentRequest) =>
          req.id === variables.id ? { ...req, is_urgent: variables.is_urgent } : req
        );
      });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(tableQueryKey, context.previousData);
      }
      showError("Failed to update urgent status. Reverting change.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] });
      queryClient.invalidateQueries({ queryKey: ['allPaymentRequestsForSummary'] });
    },
  });

  const handleToggleUrgent = async (requestId: string, currentUrgentStatus: boolean) => {
    try {
      await toggleUrgentMutation.mutateAsync({ id: requestId, is_urgent: !currentUrgentStatus });
      showSuccess(`Request marked as ${!currentUrgentStatus ? 'urgent' : 'not urgent'}!`);
    } catch (error) {
      // Error is handled by the mutation's onError callback
    }
  };

  const clearFilters = () => {
    setFilterSupplierName('');
    setFilterSkuNumber('');
    setFilterStatuses(isAllRequestsPage ? [] : activeDashboardStatuses); // Reset based on page
    setFilterDatePaymentRequired(undefined);
    setFilterRequesters([]); // Reset to no specific requesters
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

  const hasActiveFilters = filterSupplierName !== '' || filterSkuNumber !== '' || filterDatePaymentRequired !== undefined || (filterStatuses.length > 0 && !(filterStatuses as string[]).includes('all')) || (filterRequesters.length > 0 && !filterRequesters.includes('all')) || filterStartDate !== undefined || filterEndDate !== undefined;

  const getStatusBadge = (status: PaymentRequest['status'] | Transaction['status'] | StandingOrder['status'] | DirectDebit['status'], itemType?: 'payment_request' | 'transaction' | 'standing_order' | 'direct_debit') => {
    let displayText = status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.replace(/_/g, ' ').slice(1);
    let className = '';

    switch (status) {
      case 'pending':
        if (itemType === 'standing_order') {
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
      case 'paused':
        className = 'bg-gray-500 text-gray-50';
        displayText = 'Paused';
        break;
      case 'active': // For Direct Debits and Standing Orders
        className = 'bg-green-500 text-green-50';
        break;
      case 'cancelled': // For Direct Debits and Standing Orders
        className = 'bg-orange-500 text-orange-50';
        break;
      case 'awaiting_info': // For Standing Orders
        if (itemType === 'standing_order') {
            className = 'bg-orange-500 text-orange-50';
            displayText = 'Awaiting Info';
        }
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return <Badge className={cn(className, "border border-white")}>{displayText}</Badge>;
  };

  // Define columns for Payment Request export
  const paymentRequestExportColumns: (keyof PaymentRequest)[] = [
    'id', 'created_at', 'updated_at', 'requester_id', 'supplier_name', 'sku_number',
    'not_sku_related', 'lease_id', 'supplier_address', 'iban_number', 'sort_code',
    'account_number', 'bank_account_name', 'currency', 'total_amount',
    'reason_for_payment', 'date_payment_required', 'invoice_pdf_urls', 'status',
    'admin_action_by', 'admin_action_reason', 'receipt_pdf_url', 'payment_setup_date',
    'payment_approved_date', 'receipt_required', 'is_urgent', 'country',
    'last_reminder_sent_at', 'is_reminded', 'categories', 'bank_details_verified'
  ];

  const handleDownloadPaymentRequests = () => {
    if (paymentRequestsForTable) {
      // Flatten categories for CSV export
      const flattenedData = paymentRequestsForTable.map(request => {
        const base = { ...request };
        // Remove original categories for flattening
        delete (base as any).categories;
        delete (base as any).requester_profile; // Remove nested object

        // Add flattened categories
        request.categories.forEach((cat, index) => {
          (base as any)[`category_${index + 1}`] = categoryOptions.find(c => c.value === cat.category)?.label || cat.category;
          (base as any)[`amount_${index + 1}`] = cat.amount;
        });
        return base;
      });

      // Dynamically generate headers for flattened categories
      const dynamicCategoryHeaders: string[] = [];
      let maxCategories = 0;
      paymentRequestsForTable.forEach(request => {
        if (request.categories.length > maxCategories) {
          maxCategories = request.categories.length;
        }
      });
      for (let i = 1; i <= maxCategories; i++) {
        dynamicCategoryHeaders.push(`category_${i}`);
        dynamicCategoryHeaders.push(`amount_${i}`);
      }

      // Construct the final column order for CSV
      const baseColumns = [
        'id', 'created_at', 'updated_at', 'requester_id', 'supplier_name', 'sku_number',
        'not_sku_related', 'lease_id', 'supplier_address', 'iban_number', 'sort_code',
        'account_number', 'bank_account_name', 'currency', 'total_amount',
        'reason_for_payment', 'date_payment_required', 'invoice_pdf_urls', 'status',
        'admin_action_by', 'admin_action_reason', 'receipt_pdf_url', 'payment_setup_date',
        'payment_approved_date', 'receipt_required', 'is_urgent', 'country',
        'last_reminder_sent_at', 'is_reminded', 'bank_details_verified'
      ];

      const finalExportColumns = [...baseColumns, ...dynamicCategoryHeaders];

      exportToCsv(
        flattenedData,
        `payment_requests_${currentCountry}_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`,
        finalExportColumns as unknown as (keyof PaymentRequest)[]
      );
    }
  };

  return (
    <>
      {/* Filters only show on /admin/requests */}
      {isAllRequestsPage && (
        <PaymentRequestFilters
          filterSupplierName={filterSupplierName}
          setFilterSupplierName={(value) => handleTextFilterChange(setFilterSupplierName, value)}
          filterSkuNumber={filterSkuNumber}
          setFilterSkuNumber={(value) => handleTextFilterChange(setFilterSkuNumber, value)}
          filterStatuses={filterStatuses}
          setFilterStatuses={setFilterStatuses}
          filterDatePaymentRequired={filterDatePaymentRequired}
          setFilterDatePaymentRequired={(date) => { setFilterDatePaymentRequired(date); setCurrentPage(1); }}
          filterRequesters={filterRequesters}
          setFilterRequesters={setFilterRequesters}
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

      {/* Summary cards always show on /dashboard for both requester and admin */}
      {!isAllRequestsPage && (
        <div className="mb-8">
          <DashboardSummaryGroups counts={counts} />
        </div>
      )}

      {paymentRequestsForTable || isRequestsTableLoading ? (
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-2xl font-bold">
              {isAllRequestsPage ? 'All Payment Requests' : 'Priority Payment Requests'}
            </CardTitle>
            <div className="flex items-center space-x-2">
              {userRole === 'admin' && isAllRequestsPage && (
                <Button onClick={handleDownloadPaymentRequests} className="shadow-sm" variant="outline">
                  <FileDown className="mr-2 h-4 w-4" /> Download to Excel
                </Button>
              )}
            </div>
          </CardHeader>
          <PaymentRequestTable
            paymentRequests={paymentRequestsForTable}
            departments={departments}
            userRole={userRole}
            handleSort={handleSort}
            renderSortIcon={renderSortIcon}
            getStatusBadge={(status, itemType) => getStatusBadge(status, itemType)}
            handleToggleUrgent={handleToggleUrgent}
            toggleUrgentMutation={toggleUrgentMutation}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalItems={totalItems}
            onPageChange={setCurrentPage}
            isLoading={isRequestsTableLoading || isLoadingDepartments}
          />
        </Card>
      ) : (
        <p className="text-center text-muted-foreground mt-8">
          {isRequestsTableLoading ? "Loading requests..." : (isAllRequestsPage && filterStatuses.length === 0) ? "No payment requests found matching your criteria." : "No priority payment requests found."}
        </p>
      )}

      {/* Pending Standing Orders Table, shown only on dashboard for admins */}
      {!isAllRequestsPage && userRole === 'admin' && <PendingStandingOrderTable />}

      {/* Recent Activity Feed, shown only on dashboard and if no search term */}
      {!isAllRequestsPage && !debouncedSearchTerm && <RecentActivityFeed viewMode={viewMode} />}
    </>
  );
};

export default DashboardMainContent;