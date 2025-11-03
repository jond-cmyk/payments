"use client";

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import GlobalSearchResultsTable from '@/components/dashboard/GlobalSearchResultsTable';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { PaymentRequest, Transaction, StandingOrder, DirectDebit } from '@/types/supabase';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCountry } from '@/integrations/supabase/CountryContext';

// Define a union type for search results
type SearchResult = (PaymentRequest & { type: 'payment_request' }) | (Transaction & { type: 'transaction' }) | (StandingOrder & { type: 'standing_order' }) | (DirectDebit & { type: 'direct_debit' });

interface GlobalSearchResultsProps {
  debouncedSearchTerm: string;
}

const GlobalSearchResults: React.FC<GlobalSearchResultsProps> = ({ debouncedSearchTerm }) => {
  const { session, userProfile } = useSession();
  const { currentCountry } = useCountry();

  // --- Global Search Query ---
  const { data: searchResults, isLoading: isSearchLoading, error: searchError } = useQuery<SearchResult[]>({
    queryKey: ['globalSearch', debouncedSearchTerm, currentCountry],
    queryFn: async () => {
      if (!debouncedSearchTerm) return [];

      const term = `%${debouncedSearchTerm}%`;
      const searchPromises: Promise<SearchResult[]>[] = [];

      // Check if search term is a number
      const searchTermAsNumber = parseFloat(debouncedSearchTerm.replace(/,/g, ''));
      const isNumericSearch = !isNaN(searchTermAsNumber);

      // --- Payment Requests Search ---
      const prTextSearchFields = [
        'supplier_name', 'sku_number', 'supplier_address', 'iban_number', 'currency',
        'reason_for_payment', 'admin_action_reason', 'account_number', 'sort_code',
        'bank_account_name', 'lease_id'
      ];
      let prFilterString = prTextSearchFields.map(field => `${field}.ilike.${term}`).join(',');
      if (isNumericSearch) {
        prFilterString += `,total_amount.eq.${searchTermAsNumber}`;
      }
      let paymentRequestQuery = supabase
          .from('payment_requests')
          .select('*')
          .or(prFilterString);
      
      // Apply country filter for payment requests
      if (userProfile?.role === 'requester' && userProfile.country) {
        paymentRequestQuery = paymentRequestQuery.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        paymentRequestQuery = paymentRequestQuery.eq('country', currentCountry);
      }

      searchPromises.push(
        paymentRequestQuery.then(({ data, error }) => {
            if (error) {
              console.error("Error searching payment requests:", error);
              return [];
            }
            return data ? data.map(item => ({ ...item, type: 'payment_request' })) : [];
          }) as Promise<SearchResult[]>
      );

      // --- Transactions Search ---
      const trTextSearchFields = [
        'description', 'type', 'entry', 'bank', 'contra_account', 'currency', 'comment',
        'sku', 'reason_for_payment', 'category', 'merchant_name', 'notes',
        'original_transaction_id', 'bank_account'
      ];
      let trFilterString = trTextSearchFields.map(field => `${field}.ilike.${term}`).join(',');
      if (isNumericSearch) {
        trFilterString += `,amount.eq.${searchTermAsNumber}`;
      }
      let transactionQuery = supabase
          .from('transactions')
          .select('*')
          .or(trFilterString);

      // Apply country filter for transactions
      if (userProfile?.role === 'requester' && userProfile.country) {
        transactionQuery = transactionQuery.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        transactionQuery = transactionQuery.eq('country', currentCountry);
      }

      searchPromises.push(
        transactionQuery.then(({ data, error }) => {
            if (error) {
              console.error("Error searching transactions:", error);
              return [];
            }
            return data ? data.map(item => ({ ...item, type: 'transaction' })) : [];
          }) as Promise<SearchResult[]>
      );

      // --- Standing Orders Search ---
      const soTextSearchFields = [
        'payee', 'sku', 'account_name', 'account_address', 'iban_number', 'sort_code',
        'account_number', 'payment_reference', 'currency', 'bank_account'
      ];
      let soFilterString = soTextSearchFields.map(field => `${field}.ilike.${term}`).join(',');
      if (isNumericSearch) {
        soFilterString += `,total_amount.eq.${searchTermAsNumber}`;
      }
      let standingOrderQuery = supabase
          .from('standing_orders')
          .select('*')
          .or(soFilterString);

      // Apply country filter for standing orders
      if (userProfile?.role === 'requester' && userProfile.country) {
        standingOrderQuery = standingOrderQuery.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        standingOrderQuery = standingOrderQuery.eq('country', currentCountry);
      }

      searchPromises.push(
        standingOrderQuery.then(({ data, error }) => {
            if (error) {
              console.error("Error searching standing orders:", error);
              return [];
            }
            return data ? data.map(item => ({ ...item, type: 'standing_order' })) : [];
          }) as Promise<SearchResult[]>
      );

      // --- Direct Debits Search ---
      const ddTextSearchFields = [
        'payee', 'sku', 'account_number', 'payment_reference', 'bank_account', 'currency'
      ];
      let ddFilterString = ddTextSearchFields.map(field => `${field}.ilike.${term}`).join(',');
      if (isNumericSearch) {
        ddFilterString += `,total_amount.eq.${searchTermAsNumber}`;
      }
      let directDebitQuery = supabase
          .from('direct_debits')
          .select('*')
          .or(ddFilterString);

      // Apply country filter for direct debits
      if (userProfile?.role === 'requester' && userProfile.country) {
        directDebitQuery = directDebitQuery.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        directDebitQuery = directDebitQuery.eq('country', currentCountry);
      }

      searchPromises.push(
        directDebitQuery.then(({ data, error }) => {
            if (error) {
              console.error("Error searching direct debits:", error);
              return [];
            }
            return data ? data.map(item => ({ ...item, type: 'direct_debit' })) : [];
          }) as Promise<SearchResult[]>
      );


      const results = await Promise.all(searchPromises);
      return results.flat();
    },
    enabled: !!debouncedSearchTerm && !!session,
  });

  const getStatusBadge = (status: PaymentRequest['status'] | Transaction['status'] | StandingOrder['status'] | DirectDebit['status'], itemType?: 'payment_request' | 'transaction' | 'standing_order' | 'direct_debit') => {
    let displayText = status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.replace(/_/g, ' ').slice(1);
    let className = '';

    switch (status) {
      case 'pending':
        if (itemType === 'standing_order' || itemType === 'direct_debit') {
          className = 'bg-orange-500 text-orange-50';
        } else { // Default for payment_request
          className = 'bg-yellow-500 text-yellow-50';
        }
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
      case 'paused':
        className = 'bg-gray-500 text-gray-50';
        displayText = 'Paused';
        break;
      case 'active': // For Direct Debits and Standing Orders
        className = 'bg-green-500 text-green-50';
        break;
      case 'cancelled': // For Direct Debits and Standing Orders
        className = 'bg-orange-500 text-orange-50';
        break;
      case 'awaiting_info': // For Direct Debits and Standing Orders
        className = 'bg-orange-500 text-orange-50';
        displayText = 'Awaiting Info';
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return <Badge className={cn(className, "border border-white")}>{displayText}</Badge>;
  };

  if (searchError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error during search: ${searchError.message}</div>;
  }

  return (
    <Card className="shadow-sm">
      {isSearchLoading ? (
        <div className="p-4 text-center text-muted-foreground">Loading search results...</div>
      ) : (
        <GlobalSearchResultsTable
          searchResults={searchResults}
          debouncedSearchTerm={debouncedSearchTerm}
          getStatusBadge={getStatusBadge}
        />
      )}
    </Card>
  );
};

export default GlobalSearchResults;