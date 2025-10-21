"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Clock, Euro, MessageSquare, Ban, CheckCircle, FileX, PoundSterling, Repeat, Banknote, DollarSign, List, Activity } from 'lucide-react';
import { useCountry } from '@/integrations/supabase/CountryContext';

interface DashboardSummaryGroupsProps {
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
  statusKey: keyof DashboardSummaryGroupsProps['counts']; 
  count: number; 
  currentCountry: string;
  isCritical?: boolean; // New prop to differentiate styling
}> = ({ statusKey, count, currentCountry, isCritical = false }) => {
  
  const getCardStyling = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          borderClass: 'border-yellow-500',
          textClass: 'text-yellow-600',
          icon: <Clock className="h-4 w-4" />,
          title: 'Pending Requests',
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
          title: 'Queried Requests',
          description: 'Requests needing more info',
          link: `/admin/requests?status=queried`,
        };
      case 'declined':
        return {
          borderClass: 'border-red-500',
          textClass: 'text-red-600',
          icon: <Ban className="h-4 w-4" />,
          title: 'Declined Requests',
          description: 'Requests rejected',
          link: `/admin/requests?status=declined`,
        };
      case 'approved':
        return {
          borderClass: 'border-green-500',
          textClass: 'text-green-600',
          icon: <CheckCircle className="h-4 w-4" />,
          title: 'Approved Requests',
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
          title: 'Pending Standing Order',
          description: 'Standing orders awaiting approval',
          link: `/standing-orders?status=pending`,
        };
      case 'active_standing_orders':
        return {
          borderClass: 'border-green-500',
          textClass: 'text-green-600',
          icon: <Repeat className="h-4 w-4" />,
          title: 'Active Standing Order',
          description: 'Currently active standing orders',
          link: `/standing-orders?status=active`,
        };
      case 'active_direct_debits':
        return {
          borderClass: 'border-indigo-500',
          textClass: 'text-indigo-600',
          icon: <Banknote className="h-4 w-4" />,
          title: 'Active Direct Debit',
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
    <Link to={link} className="block h-full">
      <Card className={cn(
        "border-l-4 cursor-pointer shadow-sm hover:shadow-md transition-all duration-200 ease-in-out h-full",
        borderClass,
        "hover:bg-gradient-to-r hover:from-dyad-blue-light/10 hover:to-background",
        isCritical && "p-2" // Add padding for critical cards
      )}>
        <CardHeader className={cn("flex flex-row items-center justify-between space-y-0", isCritical ? "p-4 pb-1" : "p-3 pb-1")}>
          <CardTitle className={cn(isCritical ? "text-sm font-medium" : "text-xs font-medium", textClass)}>{title}</CardTitle>
          <span className={textClass}>{icon}</span>
        </CardHeader>
        <CardContent className={cn(isCritical ? "p-4 pt-0" : "p-3 pt-0")}>
          <div className={cn(isCritical ? "text-3xl font-bold" : "text-xl font-bold")}>{count}</div>
          <p className={cn(isCritical ? "text-xs" : "text-[10px]", "text-muted-foreground h-6 overflow-hidden")}>{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
};

const DashboardSummaryGroups: React.FC<DashboardSummaryGroupsProps> = ({ counts }) => {
  const { currentCountry } = useCountry();

  const criticalKeys: (keyof DashboardSummaryGroupsProps['counts'])[] = [
    'pending', 
    'setup_awaiting_approval', 
    'missing_receipts',
  ];

  const secondaryKeys: (keyof DashboardSummaryGroupsProps['counts'])[] = [
    'queried', 
    'declined', 
    'approved', 
    'pending_standing_orders', 
    'active_standing_orders', 
    'active_direct_debits',
  ];

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center text-xl font-bold">
          <Activity className="mr-2 h-5 w-5" /> Operational Overview
        </CardTitle>
        <CardDescription>Summary of all payment and transaction activities in {currentCountry}.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Tier 1: Critical Actionable Metrics (3 columns) */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            {criticalKeys.map((key) => (
              <SummaryCardItem
                key={key}
                statusKey={key}
                count={counts[key]}
                currentCountry={currentCountry}
                isCritical={true}
              />
            ))}
          </div>

          {/* Tier 2: Secondary Status and Recurring Metrics (6 columns, wraps responsively) */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {secondaryKeys.map((key) => (
              <SummaryCardItem
                key={key}
                statusKey={key}
                count={counts[key]}
                currentCountry={currentCountry}
                isCritical={false}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DashboardSummaryGroups;