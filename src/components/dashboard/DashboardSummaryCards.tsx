"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { PaymentRequest } from '@/types/supabase';
import { Clock, Euro, MessageSquare, Ban, CheckCircle, FileX, PoundSterling, Repeat, Banknote } from 'lucide-react';
import { useCountry } from '@/integrations/supabase/CountryContext';

interface DashboardSummaryCardsProps {
  counts: {
    pending: number;
    setup_awaiting_approval: number;
    approved: number;
    declined: number;
    queried: number;
    missing_receipts: number;
    pending_standing_orders: number;
    active_direct_debits: number;
    active_standing_orders: number;
    total: number;
  };
}

// Helper component for individual card rendering
const SummaryCardItem: React.FC<{ 
  statusKey: keyof DashboardSummaryCardsProps['counts']; 
  count: number; 
  currentCountry: string 
}> = ({ statusKey, count, currentCountry }) => {
  
  const getCardStyling = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          borderClass: 'border-yellow-500',
          textClass: 'text-yellow-600',
          icon: <Clock className="h-4 w-4" />,
          title: 'Pending',
          description: 'Requests awaiting review',
          link: `/admin/requests?status=pending`,
        };
      case 'setup_awaiting_approval':
        return {
          borderClass: 'border-blue-500',
          textClass: 'text-blue-600',
          icon: currentCountry === 'United Kingdom' ? <PoundSterling className="h-4 w-4" /> : <Euro className="h-4 w-4" />,
          title: 'Payment Setup',
          description: 'Payments being processed',
          link: `/admin/requests?status=setup_awaiting_approval`,
        };
      case 'queried':
        return {
          borderClass: 'border-gray-400',
          textClass: 'text-gray-700',
          icon: <MessageSquare className="h-4 w-4" />,
          title: 'Queried',
          description: 'Requests needing more info',
          link: `/admin/requests?status=queried`,
        };
      case 'declined':
        return {
          borderClass: 'border-red-500',
          textClass: 'text-red-600',
          icon: <Ban className="h-4 w-4" />,
          title: 'Declined',
          description: 'Requests rejected',
          link: `/admin/requests?status=declined`,
        };
      case 'approved':
        return {
          borderClass: 'border-green-500',
          textClass: 'text-green-600',
          icon: <CheckCircle className="h-4 w-4" />,
          title: 'Approved',
          description: 'Payments completed',
          link: `/admin/requests?status=approved`,
        };
      case 'missing_receipts':
        return {
          borderClass: 'border-orange-500',
          textClass: 'text-orange-600',
          icon: <FileX className="h-4 w-4" />,
          title: 'Missing Receipts',
          description: 'Transactions awaiting receipts',
          link: `/missing-receipts`,
        };
      case 'pending_standing_orders':
        return {
          borderClass: 'border-purple-500',
          textClass: 'text-purple-600',
          icon: <Repeat className="h-4 w-4" />,
          title: 'Pending SO',
          description: 'SO awaiting approval',
          link: `/standing-orders?status=pending`,
        };
      case 'active_standing_orders':
        return {
          borderClass: 'border-green-500',
          textClass: 'text-green-600',
          icon: <Repeat className="h-4 w-4" />,
          title: 'Active SO',
          description: 'Currently active standing orders',
          link: `/standing-orders?status=active`,
        };
      case 'active_direct_debits':
        return {
          borderClass: 'border-indigo-500',
          textClass: 'text-indigo-600',
          icon: <Banknote className="h-4 w-4" />,
          title: 'Active DD',
          description: 'Currently active direct debits',
          link: `/direct-debits?status=active`,
        };
      default:
        return {
          borderClass: 'border-gray-300',
          textClass: 'text-gray-600',
          icon: null,
          title: String(status),
          description: '',
          link: '#',
        };
    }
  };

  const { borderClass, textClass, icon, title, description, link } = getCardStyling(statusKey);

  return (
    <Link to={link} className="block">
      <Card className={cn(
        "border-l-4 cursor-pointer shadow-sm hover:shadow-md transition-all duration-200 ease-in-out",
        borderClass,
        "hover:bg-gradient-to-r hover:from-dyad-blue-light/10 hover:to-background"
      )}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1"> {/* Reduced padding */}
          <CardTitle className={cn("text-xs font-medium", textClass)}>{title}</CardTitle> {/* Reduced font size */}
          <span className={textClass}>{icon}</span>
        </CardHeader>
        <CardContent className="p-3 pt-0"> {/* Reduced padding */}
          <div className="text-xl font-bold">{count}</div> {/* Reduced font size */}
          <p className="text-[10px] text-muted-foreground h-6 overflow-hidden">{description}</p> {/* Reduced font size */}
        </CardContent>
      </Card>
    </Link>
  );
};


const DashboardSummaryCards: React.FC<DashboardSummaryCardsProps> = ({ counts }) => {
  const { currentCountry } = useCountry();

  const paymentRequestKeys: (keyof DashboardSummaryCardsProps['counts'])[] = [
    'pending',
    'setup_awaiting_approval',
    'queried',
    'declined',
    'approved',
  ];

  const transactionKeys: (keyof DashboardSummaryCardsProps['counts'])[] = [
    'missing_receipts',
  ];

  const recurringPaymentKeys: (keyof DashboardSummaryCardsProps['counts'])[] = [
    'pending_standing_orders',
    'active_standing_orders',
    'active_direct_debits',
  ];

  return (
    <div className="space-y-6">
      {/* Group 1: Payment Requests */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Payment Request Statuses</CardTitle>
          <CardDescription>Overview of the payment request pipeline.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {paymentRequestKeys.map((key) => (
              <SummaryCardItem
                key={key}
                statusKey={key}
                count={counts[key]}
                currentCountry={currentCountry}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Group 2: Transactions & Receipts */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Transaction Management</CardTitle>
          <CardDescription>Status of transactions requiring user input.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {transactionKeys.map((key) => (
              <SummaryCardItem
                key={key}
                statusKey={key}
                count={counts[key]}
                currentCountry={currentCountry}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Group 3: Recurring Payments */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Recurring Payments</CardTitle>
          <CardDescription>Status of standing orders and direct debits.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {recurringPaymentKeys.map((key) => (
              <SummaryCardItem
                key={key}
                statusKey={key}
                count={counts[key]}
                currentCountry={currentCountry}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardSummaryCards;