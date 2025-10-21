"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Clock, Euro, MessageSquare, Ban, CheckCircle, FileX, PoundSterling, Repeat, Banknote, DollarSign, List, Activity } from 'lucide-react';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { Separator } from '@/components/ui/separator'; // Import Separator

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
    // Default styling for secondary cards (white background, colored border/text)
    let borderClass = 'border-gray-300';
    let textClass = 'text-gray-600 dark:text-gray-400';
    let bgClass = 'bg-card dark:bg-card';
    let icon: React.ReactNode = null;
    let title = String(status);
    let description = '';
    let link = '#';

    switch (status) {
      case 'pending':
        borderClass = 'border-yellow-500';
        textClass = isCritical ? 'text-yellow-700 dark:text-yellow-300' : 'text-yellow-600 dark:text-yellow-400';
        bgClass = isCritical ? 'bg-yellow-100 dark:bg-yellow-900/50' : 'bg-card dark:bg-card';
        icon = <Clock className="h-4 w-4" />;
        title = 'Pending Requests';
        description = 'Requests awaiting review';
        link = `/admin/requests?status=pending`;
        break;
      case 'setup_awaiting_approval':
        borderClass = 'border-blue-500';
        textClass = isCritical ? 'text-blue-700 dark:text-blue-300' : 'text-blue-600 dark:text-blue-400';
        bgClass = isCritical ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-card dark:bg-card';
        icon = currentCountry === 'United Kingdom' ? <PoundSterling className="h-4 w-4" /> : <Euro className="h-4 w-4" />;
        title = 'Payment Setup';
        description = 'Payments being processed';
        link = `/admin/requests?status=setup_awaiting_approval`;
        break;
      case 'approved':
        borderClass = 'border-green-500';
        textClass = isCritical ? 'text-green-700 dark:text-green-300' : 'text-green-600 dark:text-green-400';
        bgClass = isCritical ? 'bg-green-100 dark:bg-green-900/50' : 'bg-card dark:bg-card';
        icon = <CheckCircle className="h-4 w-4" />;
        title = 'Approved Requests';
        description = 'Payments completed';
        link = `/admin/requests?status=approved`;
        break;
      case 'queried':
        borderClass = 'border-gray-400';
        textClass = 'text-gray-700 dark:text-gray-400';
        icon = <MessageSquare className="h-4 w-4" />;
        title = 'Queried Requests';
        description = 'Requests needing more info';
        link = `/admin/requests?status=queried`;
        break;
      case 'declined':
        borderClass = 'border-red-500';
        textClass = 'text-red-600 dark:text-red-400';
        icon = <Ban className="h-4 w-4" />;
        title = 'Declined Requests';
        description = 'Requests rejected';
        link = `/admin/requests?status=declined`;
        break;
      case 'missing_receipts':
        borderClass = 'border-orange-500';
        textClass = 'text-orange-600 dark:text-orange-400';
        icon = <FileX className="h-4 w-4" />;
        title = 'Missing Receipts';
        description = 'Transactions awaiting receipts';
        link = `/missing-receipts`;
        break;
      case 'pending_standing_orders':
        borderClass = 'border-purple-500';
        textClass = 'text-purple-600 dark:text-purple-400';
        icon = <Repeat className="h-4 w-4" />;
        title = 'Pending Standing Order';
        description = 'Standing orders awaiting approval';
        link = `/standing-orders?status=pending`;
        break;
      case 'active_standing_orders':
        borderClass = 'border-green-500';
        textClass = 'text-green-600 dark:text-green-400';
        icon = <Repeat className="h-4 w-4" />;
        title = 'Active Standing Order';
        description = 'Currently active standing orders';
        link = `/standing-orders?status=active`;
        break;
      case 'active_direct_debits':
        borderClass = 'border-indigo-500';
        textClass = 'text-indigo-600 dark:text-indigo-400';
        icon = <Banknote className="h-4 w-4" />;
        title = 'Active Direct Debit';
        description = 'Currently active direct debits';
        link = `/direct-debits?status=active`;
        break;
    }
    return { borderClass, textClass, icon, title, description, link, bgClass };
  };

  const { borderClass, textClass, icon, title, description, link, bgClass } = getCardStyling(statusKey);

  return (
    <Link to={link} className="block">
      <Card className={cn(
        "border-l-4 cursor-pointer shadow-sm hover:shadow-md transition-all duration-200 ease-in-out h-full",
        borderClass,
        bgClass, // Apply background class
        "hover:bg-gradient-to-r hover:from-dyad-blue-light/10 hover:to-background"
      )}>
        <CardHeader className={cn("flex flex-row items-center justify-between space-y-0", isCritical ? "p-4 pb-1" : "p-3 pb-1")}>
          <CardTitle className={cn(isCritical ? "text-sm font-medium" : "text-xs font-medium", textClass)}>{title}</CardTitle>
          <span className={textClass}>{icon}</span>
        </CardHeader>
        <CardContent className={cn(isCritical ? "p-4 pt-0" : "p-3 pt-0")}>
          <div className={cn(isCritical ? "text-3xl font-bold" : "text-xl font-bold", textClass)}>{count}</div>
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
    'approved', // NEW TIER 1 KEY
  ];

  const statusKeys: (keyof DashboardSummaryGroupsProps['counts'])[] = [
    'queried', 
    'declined',
  ];

  const receiptKeys: (keyof DashboardSummaryGroupsProps['counts'])[] = [
    'missing_receipts',
  ];

  const recurringKeys: (keyof DashboardSummaryGroupsProps['counts'])[] = [
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
          {/* Tier 1: Critical Actionable Metrics (3 columns, solid background) */}
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

          {/* Tier 2: Secondary Metrics with Separators */}
          <div className="space-y-4">
            {/* Group 1: Queried and Declined */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {statusKeys.map((key) => (
                <SummaryCardItem
                  key={key}
                  statusKey={key}
                  count={counts[key]}
                  currentCountry={currentCountry}
                  isCritical={false}
                />
              ))}
            </div>

            <Separator />

            {/* Group 2: Missing Receipts */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {receiptKeys.map((key) => (
                <SummaryCardItem
                  key={key}
                  statusKey={key}
                  count={counts[key]}
                  currentCountry={currentCountry}
                  isCritical={false}
                />
              ))}
            </div>

            <Separator />

            {/* Group 3: Recurring Payments */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {recurringKeys.map((key) => (
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
        </div>
      </CardContent>
    </Card>
  );
};

export default DashboardSummaryGroups;