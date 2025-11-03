"use client";

import { useEffect, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useSession } from "@/integrations/supabase/SessionContext";
import { useQueryClient } from "@tanstack/react-query";
import { showInfo } from "@/utils/toast";

import DashboardHeader from '@/components/dashboard/DashboardHeader';
import GlobalSearchResults from '@/components/dashboard/GlobalSearchResults';
import DashboardMainContent from '@/components/dashboard/DashboardMainContent';

const ITEMS_PER_PAGE = 10;

const Dashboard = () => {
  const { session, isLoading, user, userProfile } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // Global Search term from URL
  const debouncedSearchTerm = searchParams.get('q') || '';

  // View mode state for requester toggle
  const [viewMode, setViewMode] = useState<'my' | 'all'>('my');

  // Pagination states lifted from DashboardMainContent
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(ITEMS_PER_PAGE);

  const isAllRequestsPage = location.pathname === '/admin/requests';

  // Handler to reset page when items per page changes
  const handleItemsPerPageChange = (value: number | 'all') => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  // Effect for auto-refreshing dashboard data every 2 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      console.log("Auto-refreshing dashboard data...");
      showInfo("Dashboard data has been automatically refreshed.");
      
      // Invalidate all queries relevant to the dashboard to trigger a refetch
      queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] });
      queryClient.invalidateQueries({ queryKey: ['allPaymentRequestsForSummary'] });
      queryClient.invalidateQueries({ queryKey: ['allMissingReceiptsCountForSummary'] });
      queryClient.invalidateQueries({ queryKey: ['allPendingStandingOrdersCountForSummary'] });
      queryClient.invalidateQueries({ queryKey: ['allActiveStandingOrdersCountForSummary'] });
      queryClient.invalidateQueries({ queryKey: ['allActiveDirectDebitsCountForSummary'] });
      queryClient.invalidateQueries({ queryKey: ['pendingStandingOrders'] });
      queryClient.invalidateQueries({ queryKey: ['recentPaymentRequests'] });
      queryClient.invalidateQueries({ queryKey: ['recentTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['recentStandingOrders'] });
      queryClient.invalidateQueries({ queryKey: ['recentDirectDebits'] });
      if (debouncedSearchTerm) {
          queryClient.invalidateQueries({ queryKey: ['globalSearch', debouncedSearchTerm] });
      }
    }, 120000); // 2 minutes in milliseconds

    // Cleanup function to clear the interval when the component unmounts
    return () => clearInterval(interval);
  }, [queryClient, debouncedSearchTerm]); // Rerun if queryClient or search term changes

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading dashboard...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (!userProfile) {
    return <div className="flex items-center justify-center h-red-500">Error loading user profile.</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <DashboardHeader
          debouncedSearchTerm={debouncedSearchTerm}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={handleItemsPerPageChange}
          isAllRequestsPage={isAllRequestsPage}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>
      
      {debouncedSearchTerm ? (
        <GlobalSearchResults debouncedSearchTerm={debouncedSearchTerm} />
      ) : (
        <DashboardMainContent
          debouncedSearchTerm={debouncedSearchTerm}
          itemsPerPage={itemsPerPage}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          viewMode={viewMode}
        />
      )}
    </div>
  );
};

export default Dashboard;