"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  Activity,
  FileText,
  Banknote,
  Repeat,
  DollarSign,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button'; // ADDED: Import Button
import { useSession } from '@/integrations/supabase/SessionContext';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { supabase } from '@/integrations/supabase/client';
import { PaymentRequest, Transaction, StandingOrder, DirectDebit } from '@/types/supabase';
import { cn } from '@/lib/utils';
import CountryFlag from '@/components/CountryFlag'; // NEW: Import CountryFlag

// Define a union type for all possible activity items
type ActivityItem =
  | (PaymentRequest & { type: 'payment_request'; createdAtDate: Date })
  | (Transaction & { type: 'transaction'; createdAtDate: Date })
  | (StandingOrder & { type: 'standing_order'; createdAtDate: Date })
  | (DirectDebit & { type: 'direct_debit'; createdAtDate: Date });

interface RecentActivityFeedProps {
  limit?: number;
}

const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({ limit = 5 }) => {
  const { session, userProfile } = useSession();
  const { currentCountry } = useCountry();

  const isAdmin = userProfile?.role === 'admin';

  // Fetch recent Payment Requests
  const { data: recentPaymentRequests = [], isLoading: isLoadingPR } = useQuery<PaymentRequest[]>({
    queryKey: ['recentPaymentRequests', currentCountry],
    queryFn: async () => {
      let query = supabase
        .from('payment_requests')
        .select('*');
      
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (isAdmin && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  // Fetch recent Transactions (missing receipts)
  const { data: recentTransactions = [], isLoading: isLoadingTR } = useQuery<Transaction[]>({
    queryKey: ['recentTransactions', currentCountry],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('status', 'pending_input')
        .eq('receipt_urls', '{}');
      
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (isAdmin && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  // Fetch recent Standing Orders
  const { data: recentStandingOrders = [], isLoading: isLoadingSO } = useQuery<StandingOrder[]>({
    queryKey: ['recentStandingOrders', currentCountry],
    queryFn: async () => {
      let query = supabase
        .from('standing_orders')
        .select('*');
      
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (isAdmin && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  // Fetch recent Direct Debits
  const { data: recentDirectDebits = [], isLoading: isLoadingDD } = useQuery<DirectDebit[]>({
    queryKey: ['recentDirectDebits', currentCountry],
    queryFn: async () => {
      let query = supabase
        .from('direct_debits')
        .select('*');
      
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (isAdmin && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  const allRecentActivity = React.useMemo(() => {
    const activities: ActivityItem[] = [];

    recentPaymentRequests.forEach(pr => activities.push({ ...pr, type: 'payment_request', createdAtDate: parseISO(pr.created_at) }));
    recentTransactions.forEach(tr => activities.push({ ...tr, type: 'transaction', createdAtDate: parseISO(tr.created_at) }));
    recentStandingOrders.forEach(so => activities.push({ ...so, type: 'standing_order', createdAtDate: parseISO(so.created_at) }));
    recentDirectDebits.forEach(dd => activities.push({ ...dd, type: 'direct_debit', createdAtDate: parseISO(dd.created_at) }));

    // Sort all activities by creation date in descending order
    return activities.sort((a, b) => b.createdAtDate.getTime() - a.createdAtDate.getTime()).slice(0, limit);
  }, [recentPaymentRequests, recentTransactions, recentStandingOrders, recentDirectDebits, limit]);

  const isLoading = isLoadingPR || isLoadingTR || isLoadingSO || isLoadingDD;

  const getStatusBadge = (status: PaymentRequest['status'] | Transaction['status'] | StandingOrder['status'] | DirectDebit['status'], itemType: ActivityItem['type']) => {
    let displayText = status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.replace(/_/g, ' ').slice(1);
    let className = '';

    switch (status) {
      case 'pending':
        className = 'bg-yellow-500 text-yellow-50';
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
      case 'active':
        className = 'bg-green-500 text-green-50';
        break;
      case 'paused':
        className = 'bg-yellow-500 text-yellow-50';
        break;
      case 'cancelled':
        className = 'bg-red-500 text-red-50';
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return <Badge className={cn(className, "transform translate-x-0 translate-y-0")}>{displayText}</Badge>;
  };

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading recent activity...</div>;
  }

  if (allRecentActivity.length === 0) {
    return <p className="text-center text-muted-foreground mt-8">No recent activity found.</p>;
  }

  return (
    <Card className="shadow-sm mt-8">
      <CardHeader>
        <CardTitle className="flex items-center text-2xl font-bold">
          <Activity className="mr-2 h-6 w-6" /> Recent Activity
        </CardTitle>
        <CardDescription>Latest updates across all payment types.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {allRecentActivity.map(item => (
            <div key={`${item.type}-${item.id}`} className="flex items-center justify-between border-b pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-center space-x-3">
                {item.type === 'payment_request' && <DollarSign className="h-5 w-5 text-blue-600" />}
                {item.type === 'transaction' && <FileText className="h-5 w-5 text-orange-600" />}
                {item.type === 'standing_order' && <Repeat className="h-5 w-5 text-purple-600" />}
                {item.type === 'direct_debit' && <Banknote className="h-5 w-5 text-indigo-600" />}
                <div>
                  <p className="font-medium">
                    {item.type === 'payment_request' && `Payment Request: ${item.supplier_name}`}
                    {item.type === 'transaction' && `Transaction: ${item.description}`}
                    {item.type === 'standing_order' && `Standing Order: ${item.payee}`}
                    {item.type === 'direct_debit' && `Direct Debit: ${item.payee}`}
                  </p>
                  <div className="flex items-center text-sm text-muted-foreground gap-2"> {/* Added flex and gap */}
                    <CountryFlag countryName={item.country} className="h-4 w-4" /> {/* Display country flag */}
                    <span>{item.country}</span> {/* Display country name */}
                    <span>•</span>
                    <span>{format(item.createdAtDate, 'MMM dd, yyyy HH:mm')}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusBadge(item.status, item.type)}
                <Link
                  to={
                    item.type === 'payment_request'
                      ? `/request/${item.id}`
                      : item.type === 'transaction'
                      ? `/transaction/${item.id}`
                      : item.type === 'standing_order'
                      ? `/standing-order/${item.id}`
                      : `/direct-debit/${item.id}`
                  }
                >
                  <Button variant="outline" size="sm">View</Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default RecentActivityFeed;