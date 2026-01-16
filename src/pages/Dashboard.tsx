"use client";

import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useSession } from "@/integrations/supabase/SessionContext";
import { useQueryClient } from "@tanstack/react-query";
import { showInfo } from "@/utils/toast";

import DashboardHeader from '@/components/dashboard/DashboardHeader';
import GlobalSearchResults from '@/components/dashboard/GlobalSearchResults';
import DashboardMainContent from '@/components/dashboard/DashboardMainContent';

const ITEMS_PER_PAGE = 10;
const REFRESH_INTERVAL = 300000; // Increased to 5 minutes to reduce server load and UI stutter

const Dashboard = () => {
  const { session, isLoading, userProfile } = useSession();
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

  // Optimized refresh handler
  const handleRefresh = useCallback(() => {
    console.log("[Dashboard] Auto-refreshing core data...");
    
    // Invalidate specific high-priority keys instead of broad swaths
    queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] });
    queryClient.invalidateQueries({ queryKey: ['allPaymentRequestsForSummary'] });
    queryClient.invalidateQueries({ queryKey: ['allMissingReceiptsCountForSummary'] });
    
    // Low priority/static data refreshed less aggressively
    queryClient.invalidateQueries({ queryKey: ['recentActivity'], refetchType: 'none' }); 
    
    if (debouncedSearchTerm) {
      queryClient.invalidateQueries({ queryKey: ['globalSearch', debouncedSearchTerm] });
    }
    
    showInfo("Dashboard data refreshed.");
  }, [queryClient, debouncedSearchTerm]);

  // Effect for auto-refreshing dashboard data
  useEffect(() => {
    if (!session || debouncedSearchTerm) return;

    const interval = setInterval(handleRefresh, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [session, debouncedSearchTerm, handleRefresh]);

  // Handler to reset page when items per page changes
  const handleItemsPerPageChange = (value: number | 'all') => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading dashboard...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (!userProfile) {
    return <div className="flex items-center justify-center text-red-500">Error loading user profile.</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <DashboardHeader
          debouncedSearchTerm={debouncedSearchTerm}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={handleItemsPerPageChange}
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