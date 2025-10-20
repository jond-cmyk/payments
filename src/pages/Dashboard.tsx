"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/integrations/supabase/SessionContext";

import DashboardHeader from '@/components/dashboard/DashboardHeader';
import GlobalSearchSection from '@/components/dashboard/GlobalSearchSection';
import DashboardMainContent from '@/components/dashboard/DashboardMainContent';


const Dashboard = () => {
  const { session, isLoading, user, userProfile } = useSession();
  const navigate = useNavigate();

  // Global Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

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
        <DashboardHeader debouncedSearchTerm={debouncedSearchTerm} />
      </div>
      <GlobalSearchSection onSearchTermChange={setDebouncedSearchTerm} debouncedSearchTerm={debouncedSearchTerm} />
      {!debouncedSearchTerm && <DashboardMainContent debouncedSearchTerm={debouncedSearchTerm} />}
    </div>
  );
};

export default Dashboard;