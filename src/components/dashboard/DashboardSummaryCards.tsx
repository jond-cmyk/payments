"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { PaymentRequest } from '@/types/supabase';
import { Clock, Euro, MessageSquare, Ban, CheckCircle, FileX, PoundSterling } from 'lucide-react'; // Import PoundSterling
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry

interface DashboardSummaryCardsProps {
  counts: {
    pending: number;
    setup_awaiting_approval: number;
    approved: number;
    declined: number;
    queried: number;
    missing_receipts: number;
    total: number;
  };
}

const DashboardSummaryCards: React.FC<DashboardSummaryCardsProps> = ({ counts }) => {
  const { currentCountry } = useCountry(); // Get currentCountry from context

  // Helper to get card specific styling based on status
  const getCardStyling = (status: PaymentRequest['status'] | 'missing_receipts') => {
    switch (status) {
      case 'pending':
        return {
          borderClass: 'border-yellow-500',
          textClass: 'text-yellow-600',
          icon: <Clock className="h-4 w-4" />,
          title: 'Pending',
          description: 'Requests awaiting review',
          statusValue: 'pending',
          link: `/admin/requests?status=pending`,
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
        };
      case 'queried':
        return {
          borderClass: 'border-gray-400',
          textClass: 'text-gray-700',
          icon: <MessageSquare className="h-4 w-4" />,
          title: 'Queried',
          description: 'Requests needing more info',
          statusValue: 'queried',
          link: `/admin/requests?status=queried`,
        };
      case 'declined':
        return {
          borderClass: 'border-red-500',
          textClass: 'text-red-600',
          icon: <Ban className="h-4 w-4" />,
          title: 'Declined',
          description: 'Requests that were rejected',
          statusValue: 'declined',
          link: `/admin/requests?status=declined`,
        };
      case 'approved':
        return {
          borderClass: 'border-green-500',
          textClass: 'text-green-600',
          icon: <CheckCircle className="h-4 w-4" />,
          title: 'Approved',
          description: 'Payments completed',
          statusValue: 'approved',
          link: `/admin/requests?status=approved`,
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
        };
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
      {Object.keys(counts).filter(key => key !== 'total').map((statusKey) => {
        const status = statusKey as PaymentRequest['status'] | 'missing_receipts';
        const { borderClass, textClass, icon, title, description, link } = getCardStyling(status);
        return (
          <Link key={status} to={link} className="block">
            <Card className={cn(
              "border-l-4 cursor-pointer shadow-sm hover:shadow-md transition-all duration-200 ease-in-out", // Added shadow-sm and transition
              borderClass,
              "hover:bg-gradient-to-r hover:from-dyad-blue-light/10 hover:to-background" // Enhanced hover effect
            )}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className={cn("text-sm font-medium", textClass)}>{title}</CardTitle>
                <span className={textClass}>{icon}</span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{counts[status]}</div>
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