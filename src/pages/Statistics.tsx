"use client";

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { PaymentRequest } from '@/types/supabase';
import { differenceInMilliseconds, parseISO, intervalToDuration, subDays, subWeeks, subMonths, isAfter, format, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';
import { BarChart as BarChartIcon, LineChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line } from 'recharts'; // Removed TrendingUp from here
import { CheckCircle, Clock, Filter, TrendingUp } from 'lucide-react'; // Corrected: Import TrendingUp from lucide-react

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { showError } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CountrySelector from '@/components/CountrySelector';

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
  const { currentCountry, setCurrentCountry, availableCountries, isCountryLocked } = useCountry();
  const navigate = useNavigate();

  const isAdmin = userProfile?.role === 'admin';

  const [timeframeFilter, setTimeframeFilter] = useState<'all' | 'last5' | 'last10' | 'last15' | 'lastDay' | 'lastWeek' | 'lastMonth'>('all');

  const { data: allPaymentRequests, isLoading: isRequestsLoading, error: requestsError } = useQuery<PaymentRequest[]>({
    queryKey: ['paymentRequestStatistics', currentCountry],
    queryFn: async () => {
      if (!session) return [];

      let query = supabase
        .from('payment_requests')
        .select('*');
      
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  const { avgTimeToSetup, avgTimeToApprove, totalRequests, setupRequests, approvedRequests, statusChartData, trendChartData } = useMemo(() => {
    if (!allPaymentRequests) {
      return {
        avgTimeToSetup: null,
        avgTimeToApprove: null,
        totalRequests: 0,
        setupRequests: 0,
        approvedRequests: 0,
        statusChartData: [],
        trendChartData: [],
      };
    }

    let filteredRequests = [...allPaymentRequests];

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
        break;
    }

    let totalSetupMilliseconds = 0;
    let setupCount = 0;
    let totalApprovedMilliseconds = 0;
    let approvedCount = 0;

    const statusCounts: Record<PaymentRequest['status'], number> = {
      pending: 0,
      setup_awaiting_approval: 0,
      approved: 0,
      declined: 0,
      queried: 0,
    };

    const monthlyRequests: Record<string, number> = {}; // YYYY-MM -> count

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

      // For status chart
      if (request.status in statusCounts) {
        statusCounts[request.status]++;
      }

      // For trend chart
      const monthKey = format(parseISO(request.created_at), 'yyyy-MM');
      monthlyRequests[monthKey] = (monthlyRequests[monthKey] || 0) + 1;
    });

    const avgTimeToSetup = setupCount > 0 ? (totalSetupMilliseconds / setupCount) : null;
    const avgTimeToApprove = approvedCount > 0 ? (totalApprovedMilliseconds / approvedCount) : null;

    const statusChartData = Object.entries(statusCounts).map(([status, count]) => ({
      name: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      count,
    }));

    // Generate trend data for the last 6 months, even if no requests
    const today = new Date();
    const sixMonthsAgo = subMonths(today, 5); // Start 5 months before current month
    const months = eachMonthOfInterval({
      start: startOfMonth(sixMonthsAgo),
      end: endOfMonth(today),
    });

    const trendChartData = months.map(month => {
      const monthKey = format(month, 'yyyy-MM');
      return {
        name: format(month, 'MMM yyyy'),
        requests: monthlyRequests[monthKey] || 0,
      };
    });


    return {
      avgTimeToSetup,
      avgTimeToApprove,
      totalRequests: filteredRequests.length,
      setupRequests: setupCount,
      approvedRequests: approvedCount,
      statusChartData,
      trendChartData,
    };
  }, [allPaymentRequests, timeframeFilter]);

  if (isSessionLoading || isRequestsLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading statistics...</div>;
  }

  if (!session) {
    navigate('/login');
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
            <BarChartIcon className="mr-2 h-6 w-6" /> Payment Request Statistics
          </CardTitle>
          <CardDescription>
            Insights into the payment request processing times and trends.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex flex-wrap items-center gap-4 p-4 border rounded-md bg-gray-50 shadow-sm">
            <span className="font-medium text-gray-700 flex items-center">
              <Filter className="mr-2 h-4 w-4" /> Filter by:
            </span>
            <CountrySelector
              className="w-[200px]"
              triggerClassName="w-full"
              value={currentCountry}
              onValueChange={setCurrentCountry}
              disabled={isCountryLocked}
              availableCountries={isAdmin ? availableCountries : availableCountries.filter(c => c.value === userProfile?.country)}
            />
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

          {totalRequests > 0 && (
            <div className="grid gap-8 md:grid-cols-2 mt-8">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Requests by Status</CardTitle>
                  <CardDescription>Distribution of payment requests by their current status.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={statusChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="hsl(var(--primary))" name="Number of Requests" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>Monthly Request Trend</CardTitle>
                  <CardDescription>Number of new payment requests over the last 6 months.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={trendChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="requests" stroke="hsl(var(--dyad-blue))" activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Statistics;