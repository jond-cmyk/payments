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
import { PaymentRequest, Transaction } from '@/types/supabase';
import CountryFlag from '@/components/CountryFlag'; // Import CountryFlag

// Define a union type for search results
type SearchResult = (PaymentRequest & { type: 'payment_request' }) | (Transaction & { type: 'transaction' });

interface GlobalSearchResultsTableProps {
  searchResults: SearchResult[] | undefined;
  debouncedSearchTerm: string;
  getStatusBadge: (status: PaymentRequest['status'] | Transaction['status']) => React.ReactNode;
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
            <TableHead>Description / Supplier</TableHead>
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
                <Badge variant="outline" className="bg-gray-100 text-gray-800">
                  {item.type === 'payment_request' ? 'Payment Request' : 'Missing Receipt'}
                </Badge>
              </TableCell>
              <TableCell className="font-medium">
                {item.type === 'payment_request' ? item.supplier_name : item.description}
              </TableCell>
              <TableCell>
                {item.currency} {item.type === 'payment_request' ? item.payment_amount?.toFixed(2) : item.amount.toFixed(2)}
              </TableCell>
              <TableCell>
                {getStatusBadge(item.status)}
              </TableCell>
              <TableCell>
                {format(new Date(item.type === 'payment_request' ? item.date_payment_required : item.transaction_date), 'PPP')}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <CountryFlag countryName={item.country} />
                  <span>{item.country}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="outline" size="sm">
                  <Link to={item.type === 'payment_request' ? `/request/${item.id}` : `/transaction/${item.id}`}>
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