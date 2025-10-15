"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { PaymentRequest, Transaction, StandingOrder, DirectDebit } from '@/types/supabase'; // Import DirectDebit
import CountryFlag from '@/components/CountryFlag'; // Import CountryFlag
import { cn } from '@/lib/utils'; // Import cn for utility classes

// Define a union type for search results
type SearchResult = (PaymentRequest & { type: 'payment_request' }) | (Transaction & { type: 'transaction' }) | (StandingOrder & { type: 'standing_order' }) | (DirectDebit & { type: 'direct_debit' }); // Added DirectDebit

interface GlobalSearchResultsTableProps {
  searchResults: SearchResult[] | undefined;
  debouncedSearchTerm: string;
  getStatusBadge: (status: PaymentRequest['status'] | Transaction['status'] | StandingOrder['status'] | DirectDebit['status'], itemType?: 'payment_request' | 'transaction' | 'standing_order' | 'direct_debit') => React.ReactNode;
}

const GlobalSearchResultsTable: React.FC<GlobalSearchResultsTableProps> = ({
  searchResults,
  debouncedSearchTerm,
  getStatusBadge,
}) => {
  if (!searchResults || searchResults.length === 0) {
    return (
      <p className="text-center text-muted-foreground mt-8">No results found for "{debouncedSearchTerm}".</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Description / Supplier / Payee</TableHead> {/* Updated header */}
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Country</TableHead> {/* New Country column */}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {searchResults.map((item) => (
            <TableRow
              key={item.id}
              className="transition-all duration-200 ease-in-out hover:bg-gradient-to-r hover:from-dyad-blue-light hover:to-dyad-blue/10"
            >
              <TableCell>
                <Badge variant="outline" className={cn("bg-gray-100 text-gray-800", "border border-white")}> {/* Added white border */}
                  {item.type === 'payment_request' ? 'Payment Request' : item.type === 'transaction' ? 'Missing Receipt' : item.type === 'standing_order' ? 'Standing Order' : 'Direct Debit'} {/* Updated display */}
                </Badge>
              </TableCell>
              <TableCell className="font-medium">
                {item.type === 'payment_request' ? item.supplier_name : item.type === 'transaction' ? item.description : item.payee} {/* Conditional display */}
              </TableCell>
              <TableCell>
                {/* Amount is not directly available for StandingOrder and DirectDebit, display N/A or specific info */}
                {item.type === 'payment_request' ? `${item.currency} ${item.payment_amount?.toFixed(2)}` :
                 item.type === 'transaction' ? `${item.currency} ${item.amount.toFixed(2)}` :
                 'N/A'}
              </TableCell>
              <TableCell>
                {getStatusBadge(item.status, item.type)}
              </TableCell>
              <TableCell>
                {format(new Date(
                  item.type === 'payment_request' ? item.date_payment_required :
                  item.type === 'transaction' ? item.transaction_date :
                  item.payment_date
                ), 'PPP')} {/* Conditional date */}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <CountryFlag countryName={item.country} />
                  <span>{item.country}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="outline" size="sm">
                  <Link to={item.type === 'payment_request' ? `/request/${item.id}` : item.type === 'transaction' ? `/transaction/${item.id}` : item.type === 'standing_order' ? `/standing-order/${item.id}` : `/direct-debit/${item.id}`}> {/* Conditional link */}
                    View Details
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default GlobalSearchResultsTable;