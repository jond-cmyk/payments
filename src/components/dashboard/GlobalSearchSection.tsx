"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { XCircle } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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

interface GlobalSearchSectionProps {
  onSearchTermChange: (term: string) => void;
  debouncedSearchTerm: string;
}

const GlobalSearchSection: React.FC<GlobalSearchSectionProps> = ({ onSearchTermChange, debouncedSearchTerm }) => {
  const { session, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const [searchTerm, setSearchTerm] = useState('');

  // Debounce for text inputs (filters and global search)
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextFilterChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      onSearchTermChange(value);
    }, 700); // 700ms debounce for global search
  }, [onSearchTermChange]);

  // --- Global Search Query ---
  const { data: searchResults, isLoading: isSearchLoading, error: searchError } = useQuery<SearchResult[]>({
    queryKey: ['globalSearch', debouncedSearchTerm, currentCountry],
    queryFn: async () => {
      if (!debouncedSearchTerm) return [];

      const term = `%${debouncedSearchTerm}%`;
      const searchPromises: Promise<SearchResult[]>[] = [];

      // Base query for payment requests
      let paymentRequestQuery = supabase
          .from('payment_requests')
          .select('*')
          .or(`supplier_name.ilike.${term},sku_number.ilike.${term},supplier_address.ilike.${term},iban_number.ilike.${term},currency.ilike.${term},reason_for_payment.ilike.${term},admin_action_reason.ilike.${term}`);
      
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

      // Base query for transactions
      let transactionQuery = supabase
          .from('transactions')
          .select('*')
          .eq('status', 'pending_input')
          .eq('receipt_urls', '{}')
          .or(`description.ilike.${term},type.ilike.${term},entry.ilike.${term},bank.ilike.${term},contra_account.ilike.${term},currency.ilike.${term},comment.ilike.${term},sku.ilike.${term},reason_for_payment.ilike.${term},category.ilike.${term},merchant_name.ilike.${term},notes.ilike.${term}`);

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

      // NEW: Base query for standing orders
      let standingOrderQuery = supabase
          .from('standing_orders')
          .select('*')
          .or(`payee.ilike.${term},sku.ilike.${term},account_name.ilike.${term},account_address.ilike.${term},iban_number.ilike.${term},sort_code.ilike.${term},account_number.ilike.${term},payment_reference.ilike.${term},category.ilike.${term}`);

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

      // NEW: Base query for direct debits
      let directDebitQuery = supabase
          .from('direct_debits')
          .select('*')
          .or(`payee.ilike.${term},sku.ilike.${term},category.ilike.${term},account_number.ilike.${term},payment_reference.ilike.${term},bank_account.ilike.${term}`);

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

  const getStatusBadge = (status: PaymentRequest['status'] | Transaction['status'] | StandingOrder['status'] | DirectDebit['status']) => {
    let displayText = status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.replace(/_/g, ' ').slice(1);
    let className = '';

    switch (status) {
      case 'pending':
      case 'pending_input':
        className = 'bg-yellow-500 text-yellow-50';
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
      case 'active': // For Direct Debits and Standing Orders
        className = 'bg-green-500 text-green-50';
        break;
      case 'paused': // For Direct Debits and Standing Orders
        className = 'bg-yellow-500 text-yellow-50';
        break;
      case 'cancelled': // For Direct Debits and Standing Orders
        className = 'bg-red-500 text-red-50';
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return <Badge className={cn(className, "transform translate-x-0 translate-y-0")}>{displayText}</Badge>;
  };

  if (searchError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error during search: ${searchError.message}</div>;
  }

  return (
    <>
      <div className="mb-8 flex items-center gap-2">
        <Input
          placeholder="Search all requests and missing receipts..."
          value={searchTerm}
          onChange={(e) => handleTextFilterChange(e.target.value)}
          className="flex-1 shadow-sm"
        />
        {searchTerm && (
          <Button variant="outline" onClick={() => { setSearchTerm(''); onSearchTermChange(''); }} className="flex items-center gap-1 shadow-sm">
            <XCircle className="h-4 w-4" /> Clear Search
          </Button>
        )}
      </div>

      {debouncedSearchTerm && (
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
      )}
    </>
  );
};

export default GlobalSearchSection;