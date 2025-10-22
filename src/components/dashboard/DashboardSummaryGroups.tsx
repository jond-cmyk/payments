"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Clock, Euro, MessageSquare, Ban, CheckCircle, FileX, PoundSterling, Repeat, Banknote, DollarSign, List, Activity, AlertTriangle } from 'lucide-react';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { Separator } from '@/components/ui/separator'; // Keep Separator import just in case, though not used in Tier 2 now

interface DashboardSummaryGroupsProps {
  counts: {
    pending: number;
    urgent_pending: number;
    setup_awaiting_approval: number;
    urgent_setup_awaiting_approval: number;
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
  isCritical?: boolean;
  urgentCount?: number;
}> = ({ statusKey, count, currentCountry, isCritical = false, urgentCount = 0 }) => {
  
  const hasUrgent = urgentCount > 0 && (statusKey === 'pending' || statusKey === 'setup_awaiting_approval');

  const getCardStyling = (status: string, isCritical: boolean) => {
    let borderClass = 'border-gray-300';
    let textClass = 'text-gray-600 dark:text-gray-400';
    let bgClass = 'bg-card dark:bg-card';
    let icon: React.ReactNode = null;
    let title = String(status);
    let description = '';
    let link = '#';
    let hoverClass = 'hover:shadow-md hover:bg-gradient-to-r hover:from-dyad-blue-light/10 hover:to-background';

    switch (status) {
      case 'pending':
        borderClass = isCritical ? 'border-yellow-700' : 'border-yellow-500';
        textClass = isCritical ? 'text-white' : 'text-yellow-600 dark:text-yellow-400';
        bgClass = isCritical ? 'bg-yellow-600 dark:bg-yellow-800' : 'bg-card dark:bg-card';
        icon = <Clock className="h-4 w-4" />;
        title = 'Pending Requests';
        description = 'Requests awaiting review';
        link = `/admin/requests?status=pending`;
        hoverClass = isCritical ? 'hover:bg-yellow-700' : 'hover:shadow-md hover:from-yellow-100/50 hover:to-background';
        break;
      case 'setup_awaiting_approval':
        borderClass = isCritical ? 'border-blue-700' : 'border-blue-500';
        textClass = isCritical ? 'text-white' : 'text-blue-600 dark:text-blue-400';
        bgClass = isCritical ? 'bg-blue-600 dark:bg-blue-800' : 'bg-card dark:bg-card';
        icon = currentCountry === 'United Kingdom' ? <PoundSterling className="h-4 w-4" /> : <Euro className="h-4 w-4" />;
        title = 'Payment Setup';
        description = 'Payments being processed';
        link = `/admin/requests?status=setup_awaiting_approval`;
        hoverClass = isCritical ? 'hover:bg-blue-700' : 'hover:shadow-md hover:from-blue-100/50 hover:to-background';
        break;
      case 'approved':
        borderClass = isCritical ? 'border-green-700' : 'border-green-500';
        textClass = isCritical ? 'text-white' : 'text-green-600 dark:text-green-400';
        bgClass = isCritical ? 'bg-green-600 dark:bg-green-800' : 'bg-card dark:bg-card';
        icon = <CheckCircle className="h-4 w-4" />;
        title = 'Approved Requests';
        description = 'Payments completed';
        link = `/admin/requests?status=approved`;
        hoverClass = isCritical ? 'hover:bg-green-700' : 'hover:shadow-md hover:from-green-100/50 hover:to-background';
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
      default:
        // Fallback for unknown status
        break;
    }
    return { borderClass, textClass, icon, title, description, link, bgClass, hoverClass };
  };

  let { borderClass, textClass, icon, title, description, link, bgClass, hoverClass } = getCardStyling(statusKey, isCritical);

  if (hasUrgent) {
    borderClass = 'border-red-700';
    textClass = 'text-white';
    bgClass = 'bg-red-600 dark:bg-red-800';
    hoverClass = 'hover:bg-red-700';
  }

  return (
    <Link to={link} className="block">
      <Card className={cn(
        "border-l-4 cursor-pointer shadow-sm transition-all duration-200 ease-in-out h-full",
        borderClass,
        bgClass, 
        hoverClass,
        isCritical ? "p-2" : "hover:shadow-md"
      )}>
        <CardHeader className={cn("flex flex-row items-center justify-between space-y-0", isCritical ? "p-4 pb-1" : "p-3 pb-1")}>
          <CardTitle className={cn(isCritical ? "text-sm font-medium" : "text-xs font-medium", textClass)}>{title}</CardTitle>
          <span className={textClass}>{icon}</span>
        </CardHeader>
        <CardContent className={cn(isCritical ? "p-4 pt-0" : "p-3 pt-0")}>
          <div className={cn(isCritical ? "text-3xl font-bold" : "text-xl font-bold", textClass)}>{count}</div>
          {hasUrgent && (
            <div className={cn("flex items-center text-xs font-semibold mt-1", textClass)}>
              <AlertTriangle className="h-4 w-4 mr-1" />
              {urgentCount} Urgent
            </div>
          )}
          <p className={cn(isCritical ? "text-xs" : "text-[10px]", isCritical ? 'text-white/80' : 'text-muted-foreground', hasUrgent && 'mt-1')}>
            {description}
          </p>
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
    'approved', 
  ];

  const column1Keys: (keyof DashboardSummaryGroupsProps['counts'])[] = [
    'queried', 
    'declined', 
    'missing_receipts',
  ];

  const column2Keys: (keyof DashboardSummaryGroupsProps['counts'])[] = [
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
                urgentCount={counts[`urgent_${key}` as keyof typeof counts] || 0}
              />
            ))}
          </div>

          {/* Tier 2: Secondary Metrics (2 columns, strict vertical flow) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Column 1: Payment Request Statuses & Receipts */}
            <div className="space-y-3">
              {column1Keys.map((key) => (
                <SummaryCardItem
                  key={key}
                  statusKey={key}
                  count={counts[key]}
                  currentCountry={currentCountry}
                  isCritical={false}
                />
              ))}
            </div>

            {/* Column 2: Recurring Payments */}
            <div className="space-y-3">
              {column2Keys.map((key) => (
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