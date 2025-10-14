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
import { PlusCircle, XCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CardTitle, Card } from '@/components/ui/card';

import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { cn } from '@/lib/utils'; // Ensure cn is imported

import DashboardSummaryCards from '@/components/dashboard/DashboardSummaryCards';
import PaymentRequestFilters from '@/components/dashboard/PaymentRequestFilters';
import PaymentRequestTable from '@/components/dashboard/PaymentRequestTable';
import GlobalSearchResultsTable from '@/components/dashboard/GlobalSearchResultsTable';
import CountrySelector from '@/components/CountrySelector';
import CountryFlag from '@/components/CountryFlag'; // Import CountryFlag

// NEW IMPORTS FOR MODULARIZATION
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
      <DashboardHeader debouncedSearchTerm={debouncedSearchTerm} />
      <GlobalSearchSection onSearchTermChange={setDebouncedSearchTerm} debouncedSearchTerm={debouncedSearchTerm} />
      {!debouncedSearchTerm && <DashboardMainContent debouncedSearchTerm={debouncedSearchTerm} />}
    </div>
  );
};

export default Dashboard;