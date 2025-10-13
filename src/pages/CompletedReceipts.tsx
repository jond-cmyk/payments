"use client";

import React, { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Transaction } from '@/types/supabase';
import { format, parseISO } from 'date-fns';
import { Folder, FileText, CalendarDays, ChevronDown } from 'lucide-react';
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from '@/components/ui/accordion';
import { CustomAccordionTrigger } from '@/components/CustomAccordionTrigger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import PageTitle from '@/components/PageTitle';
import { cn } from '@/lib/utils'; // Import cn for utility classes

const CompletedReceipts = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const { currentCountry } = useCountry(); // Get currentCountry from context
  const navigate = useNavigate();

  const isAdmin = userProfile?.role === 'admin';

  // Fetch completed transactions with receipts
  const { data: completedTransactions, isLoading: isTransactionsLoading, error: transactionsError } = useQuery<Transaction[]>({
    queryKey: ['completedReceipts', user?.id, currentCountry], // Add currentCountry to queryKey
    queryFn: async () => {
      if (!user?.id) return [];
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('status', 'completed')
        .not('receipt_urls', 'is', null)
        .not('receipt_urls', 'eq', '{}');
        
      // Apply country filter based on user role and selected country
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }
      // If admin and currentCountry is 'all', no country filter is applied, showing all countries

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Group transactions by month and year
  const groupedTransactions = useMemo(() => {
    if (!completedTransactions) return {};

    const groups: Record<string, { display: string, transactions: Transaction[] }> = {};

    completedTransactions.forEach(transaction => {
      const date = parseISO(transaction.transaction_date);
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-indexed
      const displayMonthYear = format(date, 'MMMM yyyy'); // e.g., "September 2025"
      const groupKey = `${year}-${String(month + 1).padStart(2, '0')}`; // "YYYY-MM" for sorting

      if (!groups[groupKey]) {
        groups[groupKey] = { display: displayMonthYear, transactions: [] };
      }
      groups[groupKey].transactions.push(transaction);
    });

    // Sort transactions within each group by date descending
    Object.values(groups).forEach(group => {
      group.transactions.sort((a, b) => parseISO(b.transaction_date).getTime() - parseISO(a.transaction_date).getTime());
    });

    // Sort group keys (months) in reverse chronological order
    const sortedGroupKeys = Object.keys(groups).sort().reverse();

    const sortedGroups: Record<string, { display: string, transactions: Transaction[] }> = {};
    sortedGroupKeys.forEach(key => {
      sortedGroups[key] = groups[key];
    });

    return sortedGroups;
  }, [completedTransactions]);

  if (isSessionLoading || isTransactionsLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading completed receipts...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (transactionsError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading completed receipts: {transactionsError.message}</div>;
  }

  const getStatusBadge = (status: Transaction['status']) => {
    let className = '';
    switch (status) {
      case 'completed':
        className = 'bg-green-500 text-green-50';
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return (
      <Badge className={cn(className, "transform translate-x-0 translate-y-0")}>
        {status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.replace(/_/g, ' ').slice(1)}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Completed Receipts - KH Payments" />
      <Card className="mb-8 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <CalendarDays className="mr-2 h-6 w-6" /> Completed Receipts
          </CardTitle>
          <CardDescription>
            View transactions that have been completed and have associated receipts, organized by month and year.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(groupedTransactions).length > 0 ? (
            <Accordion type="multiple" className="w-full">
              {Object.keys(groupedTransactions).map((groupKey) => {
                const group = groupedTransactions[groupKey];
                return (
                  <AccordionItem key={groupKey} value={groupKey}>
                    <CustomAccordionTrigger className="flex items-center justify-between w-full px-4 py-3 text-lg font-semibold hover:bg-muted/50 transition-colors">
                      <span className="flex items-center justify-between w-full">
                        <span className="flex items-center">
                          <Folder className="mr-2 h-5 w-5 text-primary" /> {group.display} ({group.transactions.length})
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
                      </span>
                    </CustomAccordionTrigger>
                    <AccordionContent className="border-t border-border bg-secondary/10">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-border">
                          <thead className="bg-secondary/20">
                            <tr>
                              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Date
                              </th>
                              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Description
                              </th>
                              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Category
                              </th>
                              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Merchant Name
                              </th>
                              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Amount
                              </th>
                              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Status
                              </th>
                              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {group.transactions.map((transaction) => {
                              return (
                                <tr key={transaction.id} className="hover:bg-gradient-to-r hover:from-dyad-blue-light/5 hover:to-background transition-colors">
                                  <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">
                                    {format(parseISO(transaction.transaction_date), 'PPP')}
                                  </td>
                                  <td className="px-4 py-4 text-sm font-medium text-foreground max-w-xs"> {/* Removed whitespace-nowrap and added max-w-xs */}
                                    {transaction.description}
                                  </td>
                                  <td className="px-4 py-4 text-sm text-foreground">
                                    {transaction.category || 'N/A'}
                                  </td>
                                  <td className="px-4 py-4 text-sm text-foreground">
                                    {transaction.merchant_name || 'N/A'}
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">
                                    {transaction.currency} {transaction.amount.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                                    {getStatusBadge(transaction.status)}
                                  </td>
                                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <Button asChild variant="outline" size="sm" className="shadow-sm">
                                      <Link to={`/transaction/${transaction.id}`}>View Details</Link>
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          ) : (
            <p className="text-center text-muted-foreground mt-8">No completed transactions with receipts found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CompletedReceipts;