"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Repeat, Eye } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { supabase } from '@/integrations/supabase/client';
import { StandingOrder } from '@/types/supabase';
import { cn } from '@/lib/utils';
import CountryFlag from '@/components/CountryFlag';

const PendingStandingOrderTable: React.FC = () => {
  const { session, userProfile } = useSession();
  const { currentCountry } = useCountry();

  const isAdmin = userProfile?.role === 'admin';

  const { data: pendingStandingOrders = [], isLoading, error } = useQuery<StandingOrder[]>({
    queryKey: ['pendingStandingOrders', currentCountry],
    queryFn: async () => {
      if (!session) return [];

      let query = supabase
        .from('standing_orders')
        .select('*')
        .eq('status', 'pending');

      // Apply country filter based on user role and selected country
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }
      // If admin and currentCountry is 'all', no country filter is applied, showing all countries

      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  const getStatusBadge = (status: StandingOrder['status']) => {
    let className = '';
    switch (status) {
      case 'pending':
        className = 'bg-orange-500 text-orange-50';
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return (
      <Badge className={cn(className, "border border-white")}> {/* Added white border */}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading pending standing orders...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-500">Error loading pending standing orders: {error.message}</div>;
  }

  if (!pendingStandingOrders || pendingStandingOrders.length === 0) {
    return <p className="text-center text-muted-foreground mt-8">No pending standing orders found.</p>;
  }

  return (
    <Card className="shadow-sm mt-8">
      <CardHeader>
        <CardTitle className="flex items-center text-2xl font-bold">
          <Repeat className="mr-2 h-6 w-6" /> Pending Standing Orders
        </CardTitle>
        <CardDescription>Standing orders awaiting approval or action.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payee</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Payment Reference</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingStandingOrders.map((order) => (
                <TableRow key={order.id} className="hover:bg-gradient-to-r hover:from-dyad-blue-light/5 hover:to-background">
                  <TableCell className="font-medium">{order.payee}</TableCell>
                  <TableCell>{format(new Date(order.payment_date), 'PPP')}</TableCell>
                  <TableCell>{order.not_property_related ? 'N/A (Not Property Related)' : (order.sku || 'N/A')}</TableCell>
                  <TableCell>{order.payment_reference}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CountryFlag countryName={order.country} />
                      <span>{order.country}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(order.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/standing-order/${order.id}`}>
                        <Eye className="h-4 w-4 mr-2" /> View Details
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default PendingStandingOrderTable;