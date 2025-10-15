"use client";

import React, { useMemo, useState } from 'react'; // Import useState
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { PaymentRequest } from '@/types/supabase';
import { differenceInMilliseconds, parseISO, intervalToDuration, subDays, subWeeks, subMonths, isAfter } from 'date-fns'; // Added date-fns functions
import { BarChart, Clock, CheckCircle, TrendingUp, Filter } from 'lucide-react'; // Added Filter icon

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { showError } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; // Added Select components

// Helper function to format duration
const formatDuration = (milliseconds: number | null): string => {
  if (milliseconds === null || isNaN(milliseconds) || milliseconds < 0) {
    return 'N/A';
  }

  const duration = intervalToDuration({ start: 0, end: milliseconds });

  const parts = [];
  if (duration.days && duration.days > 0) {
    parts.push(`${duration.days} day${duration.days > 1 ? 's' : ''}`);
  }
  if (duration.hours && duration.hours > 0) {
    parts.push(`${duration.hours} hour${duration.hours > 1 ? 's' : ''}`);
  }
  if (duration.minutes && duration.minutes > 0) {
    parts.push(`${duration.minutes} minute${duration.minutes > 1 ? 's' : ''}`);
  }

  if (parts.length === 0) {
    return '0 minutes'; // If duration is less than a minute
  }
  return parts.join(', ');
};

const Statistics = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();

  const isAdmin = userProfile?.role === 'admin';

  // NEW: State for timeframe filter
  const [timeframeFilter, setTimeframeFilter] = useState<'all' | 'last5' | 'last10' | 'last15' | 'lastDay' | 'lastWeek' | 'lastMonth'>('all');

  // Fetch all payment requests for statistics
  const { data: allPaymentRequests, isLoading: isRequestsLoading, error: requestsError } = useQuery<PaymentRequest[]>({ // Renamed to allPaymentRequests
    queryKey: ['paymentRequestStatistics', currentCountry], // timeframeFilter will be applied client-side
    queryFn: async () => {
      if (!session) return [];

      let query = supabase
        .from('payment_requests')
        .select('*');
      
      if (currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query.order('created_at', { ascending: false }); // Order by created_at for 'last N' filters
      if (error) throw error;
      return data;
    },
    enabled: !!session && isAdmin,
  });

  const { avgTimeToSetup, avgTimeToApprove, totalRequests, setupRequests, approvedRequests } = useMemo(() => {
    if (!allPaymentRequests) {
      return {
        avgTimeToSetup: null,
        avgTimeToApprove: null,
        totalRequests: 0,
        setupRequests: 0,
        approvedRequests: 0,
      };
    }

    let filteredRequests = [...allPaymentRequests]; // Create a mutable copy

    // Apply timeframe filter
    const now = new Date();
    switch (timeframeFilter) {
      case 'last5':
        filteredRequests = filteredRequests.slice(0, 5);
        break;
      case 'last10':
        filteredRequests = filteredRequests.slice(0, 10);
        break;
      case 'last15':
        filteredRequests = filteredRequests.slice(0, 15);
        break;
      case 'lastDay':
        const oneDayAgo = subDays(now, 1);
        filteredRequests = filteredRequests.filter(req => isAfter(parseISO(req.created_at), oneDayAgo));
        break;
      case 'lastWeek':
        const oneWeekAgo = subWeeks(now, 1);
        filteredRequests = filteredRequests.filter(req => isAfter(parseISO(req.created_at), oneWeekAgo));
        break;
      case 'lastMonth':
        const oneMonthAgo = subMonths(now, 1);
        filteredRequests = filteredRequests.filter(req => isAfter(parseISO(req.created_at), oneMonthAgo));
        break;
      case 'all':
      default:
        // No filter applied, use all requests
        break;
    }

    let totalSetupMilliseconds = 0;
    let setupCount = 0;
    let totalApprovedMilliseconds = 0;
    let approvedCount = 0;

    filteredRequests.forEach(request => {
      if (request.created_at && request.payment_setup_date) {
        const createdDate = parseISO(request.created_at);
        const setupDate = parseISO(request.payment_setup_date);
        totalSetupMilliseconds += differenceInMilliseconds(setupDate, createdDate);
        setupCount++;
      }

      if (request.payment_setup_date && request.payment_approved_date) {
        const setupDate = parseISO(request.payment_setup_date);
        const approvedDate = parseISO(request.payment_approved_date);
        totalApprovedMilliseconds += differenceInMilliseconds(approvedDate, setupDate);
        approvedCount++;
      }
    });

    const avgTimeToSetup = setupCount > 0 ? (totalSetupMilliseconds / setupCount) : null;
    const avgTimeToApprove = approvedCount > 0 ? (totalApprovedMilliseconds / approvedCount) : null;

    return {
      avgTimeToSetup,
      avgTimeToApprove,
      totalRequests: filteredRequests.length, // Use filteredRequests.length for total
      setupRequests: setupCount,
      approvedRequests: approvedCount,
    };
  }, [allPaymentRequests, timeframeFilter]); // Added timeframeFilter to dependencies

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
          {/* NEW: Filter controls */}
          <div className="mb-6 flex items-center gap-4 p-4 border rounded-md bg-gray-50 shadow-sm">
            <span className="font-medium text-gray-700 flex items-center">
              <Filter className="mr-2 h-4 w-4" /> Filter by:
            </span>
            <Select value={timeframeFilter} onValueChange={(value: typeof timeframeFilter) => setTimeframeFilter(value)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select timeframe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="last5">Last 5 Requests</SelectItem>
                <SelectItem value="last10">Last 10 Requests</SelectItem>
                <SelectItem value="last15">Last 15 Requests</SelectItem>
                <SelectItem value="lastDay">Last 24 Hours</SelectItem>
                <SelectItem value="lastWeek">Last 7 Days</SelectItem>
                <SelectItem value="lastMonth">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="border-l-4 border-dyad-blue shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-dyad-blue">Total Requests</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalRequests}</div>
                <p className="text-xs text-muted-foreground">Payment requests in selected timeframe</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-blue-500 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-600">Avg. Time to Setup</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatDuration(avgTimeToSetup)}
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
                  {formatDuration(avgTimeToApprove)}
                </div>
                <p className="text-xs text-muted-foreground">From payment setup to approval ({approvedRequests} requests)</p>
              </CardContent>
            </Card>
          </div>
          {totalRequests === 0 && (
            <p className="text-center text-muted-foreground mt-8">No payment requests found to generate statistics for the selected timeframe.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Statistics;