"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { PaymentRequest, Profile, Transaction } from '@/types/supabase';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { PlusCircle, XCircle, ArrowUp, ArrowDown, KeyRound } from 'lucide-react'; // Import KeyRound icon
import { Input } from '@/components/ui/input';
import { CardTitle, Card } from '@/components/ui/card'; // Import Card
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'; // Import Dialog components

import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry

// Import new modular components
import DashboardSummaryCards from '@/components/dashboard/DashboardSummaryCards';
import PaymentRequestFilters from '@/components/dashboard/PaymentRequestFilters';
import PaymentRequestTable from '@/components/dashboard/PaymentRequestTable';
import GlobalSearchResultsTable from '@/components/dashboard/GlobalSearchResultsTable';
import CountrySelector from '@/components/CountrySelector'; // Import CountrySelector
import ChangePasswordForm from '@/components/auth/ChangePasswordForm'; // Import ChangePasswordForm

// Define a union type for search results
type SearchResult = (PaymentRequest & { type: 'payment_request' }) | (Transaction & { type: 'transaction' });

const Dashboard = () => {
  const { session, isLoading, user, userProfile } = useSession();
  const { currentCountry } = useCountry(); // Get currentCountry from context
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams(); // Corrected: Use useSearchParams hook directly
  const [isChangePasswordDialogOpen, setIsChangePasswordDialogOpen] = useState(false); // State for change password dialog

  const userRole = userProfile?.role || null;

  // Filter states for the table
  const [filterSupplierName, setFilterSupplierName] = useState('');
  const [filterSkuNumber, setFilterSkuNumber] = useState('');
  const [filterStatus, setFilterStatus] = useState<PaymentRequest['status'] | 'all'>('all');
  const [filterDatePaymentRequired, setFilterDatePaymentRequired] = useState<Date | undefined>(undefined);
  const [filterRequester, setFilterRequester] = useState<string>('all');

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
    }, 500);
  }, []);

  // Effect to debounce global search term
  useEffect(() => {
    const handler = setTimeout(() => {
      console.log(`[Dashboard] Debounced global search term: ${searchTerm}`);
      setDebouncedSearchTerm(searchTerm);
    }, 700);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  // Effect to read URL parameters for initial filter state
  useEffect(() => {
    const statusParam = searchParams.get('status'); // Use searchParams from useSearchParams
    if (statusParam && (statusParam === 'pending' || statusParam === 'setup_awaiting_approval' || statusParam === 'approved' || statusParam === 'declined' || statusParam === 'queried' || statusParam === 'all')) {
      setFilterStatus(statusParam);
    } else if (location.pathname === '/admin/requests') {
      setFilterStatus('all');
    } else {
      setFilterStatus('pending');
    }
  }, [searchParams, location.pathname]); // Depend on searchParams directly

  // Determine if we are on the 'All Requests' page
  const isAllRequestsPage = location.pathname === '/admin/requests';
  // Determine if it's a requester's personal dashboard (showing their urgent requests)
  const isRequesterPersonalDashboard = userRole === 'requester' && location.pathname === '/dashboard';
  // Determine if it's an admin's personal dashboard (showing all urgent requests)
  const isAdminUrgentDashboard = userRole === 'admin' && location.pathname === '/dashboard';


  // --- Data for Summary Cards (Global Totals) ---
  const allPaymentRequestsForSummaryQuery = useQuery<PaymentRequest[]>({
    queryKey: ['allPaymentRequestsForSummary', currentCountry], // Add currentCountry to queryKey
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
    queryKey: ['allMissingReceiptsCountForSummary', currentCountry], // Add currentCountry to queryKey
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

  // Fetch all user profiles for the requester dropdown filter
  const { data: allProfiles, isLoading: isProfilesLoading, error: profilesError } = useQuery<Profile[]>({
    queryKey: ['allProfilesForFilter', currentCountry], // Add currentCountry to queryKey
    queryFn: async () => {
      let query = supabase
        .from('profile_with_email')
        .select('id, first_name, last_name, user_email, role, is_approved, avatar_url, updated_at'); // Select all fields required by Profile type
      
      // Filter profiles by selected country if not 'all'
      if (currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!session && isAllRequestsPage, // Only fetch if on the 'All Requests' page
  });

  // --- Data for Table Display (Conditional) ---
  const { data: paymentRequestsForTable, isLoading: isRequestsTableLoading, error: requestsError } = useQuery<
    (PaymentRequest & { requester_profile: { first_name: string | null } | null })[]
  >({
    queryKey: ['paymentRequestsForTable', user?.id, userRole, filterSupplierName, filterSkuNumber, filterStatus, filterDatePaymentRequired, filterRequester, isAllRequestsPage, isRequesterPersonalDashboard, isAdminUrgentDashboard, sortColumn, sortDirection, currentCountry], // Add currentCountry to queryKey
    queryFn: async () => {
      if (!user?.id || !userRole || debouncedSearchTerm) return [];

      let query = supabase.from('payment_requests').select('*, requester_profile:profiles(first_name)');

      // Apply country filter based on user role and selected country
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }
      // If admin and currentCountry is 'all', no country filter is applied, showing all countries

      if (isRequesterPersonalDashboard) {
        // Requester's personal dashboard: only their urgent requests
        query = query.eq('requester_id', user.id)
                     .eq('is_urgent', true)
                     .in('status', ['pending', 'setup_awaiting_approval', 'queried']);
      } else if (isAdminUrgentDashboard) {
        // Admin's personal dashboard: all urgent requests
        query = query.eq('is_urgent', true)
                     .in('status', ['pending', 'setup_awaiting_approval', 'queried']);
      } else if (isAllRequestsPage) {
        // Admin's 'All Requests' page: apply filters
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
        if (filterRequester !== 'all') {
          query = query.eq('requester_id', filterRequester);
        }
      } else {
        // Fallback for other cases, e.g., if a non-admin/non-requester somehow lands here
        return [];
      }

      // Always sort urgent requests to the top, then by the selected column
      query = query.order('is_urgent', { ascending: false });
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
    enabled: !!user?.id && !!userRole && !debouncedSearchTerm,
  });

  // --- Global Search Query ---
  const { data: searchResults, isLoading: isSearchLoading, error: searchError } = useQuery<SearchResult[]>({
    queryKey: ['globalSearch', debouncedSearchTerm, currentCountry], // Add currentCountry to queryKey
    queryFn: async () => {
      if (!debouncedSearchTerm) return [];

      const term = `%${debouncedSearchTerm}%`;
      const searchPromises: Promise<SearchResult[]>[] = [];

      // Base query for payment requests
      let paymentRequestQuery = supabase
          .from('payment_requests')
          .select('*')
          .or(`supplier_name.ilike.${term},sku_number.ilike.${term},supplier_address.ilike.${term},iban_number.ilike.${term},currency.ilike.${term},reason_for_payment.ilike.${term},admin_action_reason.ilike.${term}`);
      
      // Apply country filter for payment requests
      if (userProfile?.role === 'requester' && userProfile.country) {
        paymentRequestQuery = paymentRequestQuery.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        paymentRequestQuery = paymentRequestQuery.eq('country', currentCountry);
      }

      searchPromises.push(
        paymentRequestQuery.then(({ data, error }) => {
            if (error) {
              console.error("Error searching payment requests:", error);
              return [];
            }
            return data ? data.map(item => ({ ...item, type: 'payment_request' })) : [];
          }) as Promise<SearchResult[]>
      );

      // Base query for transactions
      let transactionQuery = supabase
          .from('transactions')
          .select('*')
          .eq('status', 'pending_input')
          .eq('receipt_urls', '{}')
          .or(`description.ilike.${term},type.ilike.${term},entry.ilike.${term},bank.ilike.${term},contra_account.ilike.${term},currency.ilike.${term},comment.ilike.${term},sku.ilike.${term},reason_for_payment.ilike.${term},category.ilike.${term},merchant_name.ilike.${term},notes.ilike.${term}`);

      // Apply country filter for transactions
      if (userProfile?.role === 'requester' && userProfile.country) {
        transactionQuery = transactionQuery.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        transactionQuery = transactionQuery.eq('country', currentCountry);
      }

      searchPromises.push(
        transactionQuery.then(({ data, error }) => {
            if (error) {
              console.error("Error searching transactions:", error);
              return [];
            }
            return data ? data.map(item => ({ ...item, type: 'transaction' })) : [];
          }) as Promise<SearchResult[]>
      );

      const results = await Promise.all(searchPromises);
      return results.flat();
    },
    enabled: !!debouncedSearchTerm && !!session,
  });

  // Mutation for toggling urgent status
  const toggleUrgentMutation = useMutation({
    mutationFn: async ({ id, is_urgent }: { id: string; is_urgent: boolean }) => {
      if (!user?.id) throw new Error("User not authenticated.");
      const { error } = await supabase
        .from('payment_requests')
        .update({ is_urgent: is_urgent, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('country', currentCountry); // Ensure country filter for update
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
    setSearchParams({});
    queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] });
  };

  const handleSort = (column: keyof PaymentRequest) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (column: keyof PaymentRequest) => {
    if (sortColumn === column) {
      return sortDirection === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
    }
    return null;
  };

  const hasActiveFilters = filterSupplierName !== '' || filterSkuNumber !== '' || filterDatePaymentRequired !== undefined || filterStatus !== 'all' || filterRequester !== 'all';

  if (isLoading || allPaymentRequestsForSummaryQuery.isLoading || allMissingReceiptsCountForSummaryQuery.isLoading || isRequestsTableLoading || isSearchLoading || (isAllRequestsPage && isProfilesLoading)) {
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

  if (profilesError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading profiles for filter: {profilesError.message}</div>;
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

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">
          {debouncedSearchTerm ? `Search Results for "${debouncedSearchTerm}"` : (
            isAllRequestsPage ? 'All Payment Requests' : 'Summary of Payment Requests'
          )}
        </h1>
        <div className="flex items-center space-x-4"> {/* Added a div to group buttons */}
          <Dialog open={isChangePasswordDialogOpen} onOpenChange={setIsChangePasswordDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="shadow-sm">
                <KeyRound className="mr-2 h-4 w-4" /> Change Password
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Change Password</DialogTitle>
              </DialogHeader>
              <ChangePasswordForm onPasswordChanged={() => setIsChangePasswordDialogOpen(false)} />
            </DialogContent>
          </Dialog>
          {(userRole === 'requester' || userRole === 'admin') && (
            <Button onClick={() => navigate('/new-request')} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground" size="lg">
              <PlusCircle className="mr-2 h-5 w-5" />
              Create New Request
            </Button>
          )}
        </div>
      </div>

      {/* Global Search Input */}
      <div className="mb-8 flex items-center gap-2">
        <Input
          placeholder="Search all requests and missing receipts..."
          value={searchTerm}
          onChange={(e) => handleTextFilterChange(setSearchTerm, e.target.value)} // Use handleTextFilterChange for global search
          className="flex-1 shadow-sm" // Added shadow-sm
        />
        {searchTerm && (
          <Button variant="outline" onClick={() => setSearchTerm('')} className="flex items-center gap-1 shadow-sm"> {/* Added shadow-sm */}
            <XCircle className="h-4 w-4" /> Clear Search
          </Button>
        )}
      </div>

      {debouncedSearchTerm ? (
        <Card className="shadow-sm"> {/* Added shadow-sm to search results card */}
          <GlobalSearchResultsTable
            searchResults={searchResults}
            debouncedSearchTerm={debouncedSearchTerm}
            getStatusBadge={getStatusBadge}
          />
        </Card>
      ) : (
        <>
          {/* Country Selector for Admins on Dashboard */}
          {userRole === 'admin' && !isAllRequestsPage && (
            <div className="mb-6">
              <CountrySelector className="w-full max-w-xs" />
            </div>
          )}

          {/* Summary cards always show on /dashboard for both requester and admin */}
          {!isAllRequestsPage && (
            <DashboardSummaryCards counts={counts} />
          )}

          {/* New title for Urgent Payment Requests */}
          {(!isAllRequestsPage && (isRequesterPersonalDashboard || isAdminUrgentDashboard)) && (
            <h2 className="text-2xl font-bold mb-4 mt-8">Urgent Payment Requests</h2>
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
              setFilterDatePaymentRequired={setFilterDatePaymentRequired}
              filterRequester={filterRequester}
              setFilterRequester={setFilterRequester}
              allProfiles={allProfiles}
              clearFilters={clearFilters}
              hasActiveFilters={hasActiveFilters}
              handleTextFilterChange={handleTextFilterChange}
            />
          )}

          {(isAllRequestsPage || isRequesterPersonalDashboard || isAdminUrgentDashboard) && paymentRequestsForTable && paymentRequestsForTable.length > 0 ? (
            <Card className="shadow-sm"> {/* Added shadow-sm to table card */}
              <PaymentRequestTable
                paymentRequests={paymentRequestsForTable}
                userRole={userRole}
                handleSort={handleSort}
                renderSortIcon={renderSortIcon}
                getStatusBadge={getStatusBadge}
                handleToggleUrgent={handleToggleUrgent}
                toggleUrgentMutation={toggleUrgentMutation}
              />
            </Card>
          ) : (
            <p className="text-center text-muted-foreground mt-8">
              {isAdminUrgentDashboard || isRequesterPersonalDashboard
                ? 'No urgent payment requests found.'
                : 'No payment requests found matching your criteria.'}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;