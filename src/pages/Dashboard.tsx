"use client";

import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSession } from "@/integrations/supabase/SessionContext";

import DashboardHeader from '@/components/dashboard/DashboardHeader';
import GlobalSearchSection from '@/components/dashboard/GlobalSearchSection';
import DashboardMainContent from '@/components/dashboard/DashboardMainContent';

const ITEMS_PER_PAGE = 10;

const Dashboard = () => {
  const { session, isLoading, user, userProfile } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  // Global Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Pagination states lifted from DashboardMainContent
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(ITEMS_PER_PAGE);

  const isAllRequestsPage = location.pathname === '/admin/requests';

  // Handler to reset page when items per page changes
  const handleItemsPerPageChange = (value: number | 'all') => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

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
      <div className="mb-8"> {/* Added mb-8 wrapper for spacing */}
        <DashboardHeader
          debouncedSearchTerm={debouncedSearchTerm}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={handleItemsPerPageChange}
          isAllRequestsPage={isAllRequestsPage}
        />
      </div>
      <GlobalSearchSection onSearchTermChange={setDebouncedSearchTerm} debouncedSearchTerm={debouncedSearchTerm} />
      {!debouncedSearchTerm && (
        <DashboardMainContent
          debouncedSearchTerm={debouncedSearchTerm}
          itemsPerPage={itemsPerPage}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
        />
      )}
    </div>
  );
};

export default Dashboard;