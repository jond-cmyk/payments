"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { PaymentRequest } from '@/types/supabase';
import { Clock, Euro, MessageSquare, Ban, CheckCircle, FileX, PoundSterling, Repeat, Banknote } from 'lucide-react'; // Import Banknote and Repeat icon
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry

interface DashboardSummaryCardsProps {
  counts: {
    pending: number;
    setup_awaiting_approval: number;
    approved: number;
    declined: number;
    queried: number;
    missing_receipts: number;
    pending_standing_orders: number;
    active_direct_debits: number; // NEW
    active_standing_orders: number; // NEW
    total: number;
  };
}

const DashboardSummaryCards: React.FC<DashboardSummaryCardsProps> = ({ counts }) => {
  const { currentCountry } = useCountry(); // Get currentCountry from context

  // Helper to get card specific styling based on status
  const getCardStyling = (status: PaymentRequest['status'] | 'missing_receipts' | 'pending_standing_orders' | 'active_standing_orders' | 'active_direct_debits') => { // Updated type
    switch (status) {
      case 'pending':
        return {
          borderClass: 'border-yellow-500',
          textClass: 'text-yellow-600',
          icon: <Clock className="h-4 w-4" />,
          title: 'Pending Requests',
          description: 'Requests awaiting review',
          statusValue: 'pending',
          link: `/admin/requests?status=pending`,
          order: 1,
        };
      case 'setup_awaiting_approval':
        return {
          borderClass: 'border-blue-500',
          textClass: 'text-blue-600',
          icon: currentCountry === 'United Kingdom' ? <PoundSterling className="h-4 w-4" /> : <Euro className="h-4 w-4" />, // Conditional icon
          title: 'Payment Setup',
          description: 'Payments being processed',
          statusValue: 'setup_awaiting_approval',
          link: `/admin/requests?status=setup_awaiting_approval`,
          order: 2,
        };
      case 'queried':
        return {
          borderClass: 'border-gray-400',
          textClass: 'text-gray-700',
          icon: <MessageSquare className="h-4 w-4" />,
          title: 'Queried Requests',
          description: 'Requests needing more info',
          statusValue: 'queried',
          link: `/admin/requests?status=queried`,
          order: 3,
        };
      case 'declined':
        return {
          borderClass: 'border-red-500',
          textClass: 'text-red-600',
          icon: <Ban className="h-4 w-4" />,
          title: 'Declined Requests',
          description: 'Requests that were rejected',
          statusValue: 'declined',
          link: `/admin/requests?status=declined`,
          order: 4,
        };
      case 'approved':
        return {
          borderClass: 'border-green-500',
          textClass: 'text-green-600',
          icon: <CheckCircle className="h-4 w-4" />,
          title: 'Approved Requests',
          description: 'Payments completed',
          statusValue: 'approved',
          link: `/admin/requests?status=approved`,
          order: 5,
        };
      case 'missing_receipts':
        return {
          borderClass: 'border-orange-500',
          textClass: 'text-orange-600',
          icon: <FileX className="h-4 w-4" />,
          title: 'Missing Receipts',
          description: 'Transactions awaiting receipts',
          statusValue: 'missing_receipts',
          link: `/missing-receipts`,
          order: 6,
        };
      case 'pending_standing_orders':
        return {
          borderClass: 'border-purple-500',
          textClass: 'text-purple-600',
          icon: <Repeat className="h-4 w-4" />,
          title: 'Pending Standing Orders',
          description: 'Standing orders awaiting approval',
          statusValue: 'pending_standing_orders',
          link: `/standing-orders?status=pending`,
          order: 7,
        };
      case 'active_standing_orders': // NEW
        return {
          borderClass: 'border-green-500',
          textClass: 'text-green-600',
          icon: <Repeat className="h-4 w-4" />,
          title: 'Active Standing Orders',
          description: 'Currently active standing orders',
          statusValue: 'active_standing_orders',
          link: `/standing-orders?status=active`,
          order: 8,
        };
      case 'active_direct_debits': // NEW
        return {
          borderClass: 'border-indigo-500',
          textClass: 'text-indigo-600',
          icon: <Banknote className="h-4 w-4" />,
          title: 'Active Direct Debits',
          description: 'Currently active direct debits',
          statusValue: 'active_direct_debits',
          link: `/direct-debits?status=active`,
          order: 9,
        };
      default:
        return {
          borderClass: 'border-gray-300',
          textClass: 'text-gray-600',
          icon: null,
          title: 'Unknown',
          description: '',
          statusValue: 'all',
          link: '#',
          order: 100,
        };
    }
  };

  // Define the order of cards to display
  const cardOrder: (keyof DashboardSummaryCardsProps['counts'])[] = [
    'pending',
    'setup_awaiting_approval',
    'queried',
    'declined',
    'approved',
    'missing_receipts',
    'pending_standing_orders',
    'active_standing_orders',
    'active_direct_debits',
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
      {cardOrder.map((statusKey) => {
        // Skip if the key is 'total' or if the count is 0 (optional, but cleaner)
        if (statusKey === 'total') return null;
        
        const count = counts[statusKey];
        const { borderClass, textClass, icon, title, description, link } = getCardStyling(statusKey as any);

        return (
          <Link key={statusKey} to={link} className="block">
            <Card className={cn(
              "border-l-4 cursor-pointer shadow-sm hover:shadow-md transition-all duration-200 ease-in-out",
              borderClass,
              "hover:bg-gradient-to-r hover:from-dyad-blue-light/10 hover:to-background"
            )}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className={cn("text-sm font-medium", textClass)}>{title}</CardTitle>
                <span className={textClass}>{icon}</span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{count}</div>
                <p className="text-xs text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
};

export default DashboardSummaryCards;