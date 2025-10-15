"use client";

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { PaymentRequest } from '@/types/supabase';
import { differenceInDays, parseISO, intervalToDuration } from 'date-fns';
import { BarChart, Clock, CheckCircle, DollarSign, TrendingUp } from 'lucide-react';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { showError } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';

const Statistics = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();

  const isAdmin = userProfile?.role === 'admin';

  // Fetch all payment requests for statistics
  const { data: paymentRequests, isLoading: isRequestsLoading, error: requestsError } = useQuery<PaymentRequest[]>({
    queryKey: ['paymentRequestStatistics', currentCountry],
    queryFn: async () => {
      if (!session) return [];

      let query = supabase
        .from('payment_requests')
        .select('*');
      
      // Admins see all countries in statistics, requesters cannot access this page
      if (currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!session && isAdmin,
  });

  const { avgTimeToSetup, avgTimeToApprove, totalRequests, setupRequests, approvedRequests } = useMemo(() => {
    if (!paymentRequests) {
      return {
        avgTimeToSetup: null,
        avgTimeToApprove: null,
        totalRequests: 0,
        setupRequests: 0,
        approvedRequests: 0,
      };
    }

    let totalSetupDays = 0;
    let setupCount = 0;
    let totalApprovedDays = 0;
    let approvedCount = 0;

    paymentRequests.forEach(request => {
      if (request.created_at && request.payment_setup_date) {
        const createdDate = parseISO(request.created_at);
        const setupDate = parseISO(request.payment_setup_date);
        totalSetupDays += differenceInDays(setupDate, createdDate);
        setupCount++;
      }

      if (request.payment_setup_date && request.payment_approved_date) {
        const setupDate = parseISO(request.payment_setup_date);
        const approvedDate = parseISO(request.payment_approved_date);
        totalApprovedDays += differenceInDays(approvedDate, setupDate);
        approvedCount++;
      }
    });

    const avgTimeToSetup = setupCount > 0 ? (totalSetupDays / setupCount) : null;
    const avgTimeToApprove = approvedCount > 0 ? (totalApprovedDays / approvedCount) : null;

    return {
      avgTimeToSetup,
      avgTimeToApprove,
      totalRequests: paymentRequests.length,
      setupRequests: setupCount,
      approvedRequests: approvedCount,
    };
  }, [paymentRequests]);

  if (isSessionLoading || isRequestsLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading statistics...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (!isAdmin) {
    showError("You do not have permission to view this page.");
    navigate('/dashboard');
    return null;
  }

  if (requestsError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading payment requests: {requestsError.message}</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Statistics - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <BarChart className="mr-2 h-6 w-6" /> Payment Request Statistics
          </CardTitle>
          <CardDescription>
            Insights into the payment request processing times.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="border-l-4 border-dyad-blue shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-dyad-blue">Total Requests</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalRequests}</div>
                <p className="text-xs text-muted-foreground">All payment requests submitted</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-blue-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-600">Avg. Time to Setup</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {avgTimeToSetup !== null ? `${avgTimeToSetup.toFixed(1)} days` : 'N/A'}
                </div>
                <p className="text-xs text-muted-foreground">From submission to payment setup ({setupRequests} requests)</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-green-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-green-600">Avg. Time to Approve</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {avgTimeToApprove !== null ? `${avgTimeToApprove.toFixed(1)} days` : 'N/A'}
                </div>
                <p className="text-xs text-muted-foreground">From payment setup to approval ({approvedRequests} requests)</p>
              </CardContent>
            </Card>
          </div>
          {totalRequests === 0 && (
            <p className="text-center text-muted-foreground mt-8">No payment requests found to generate statistics.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Statistics;