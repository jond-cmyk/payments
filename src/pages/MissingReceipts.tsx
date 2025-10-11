"use client";

import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Transaction } from '@/types/supabase';
import { format } from 'date-fns';
import { FileText, CheckCircle, Clock, XCircle, ReceiptOff } from 'lucide-react'; // Added ReceiptOff icon

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const MissingReceipts = () => {
  const { session, isLoading: isSessionLoading, user } = useSession();
  const navigate = useNavigate();

  // Fetch transactions assigned to the current user that are pending input and have no receipts
  const { data: transactions, isLoading: isTransactionsLoading, error: transactionsError } = useQuery<Transaction[]>({
    queryKey: ['missingReceipts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('requester_id', user.id)
        .eq('status', 'pending_input') // Filter for pending input
        .eq('receipt_urls', '{}') // Filter for empty receipt_urls array
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  if (isSessionLoading || isTransactionsLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading missing receipts...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (transactionsError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading missing receipts: {transactionsError.message}</div>;
  }

  const getStatusBadge = (status: Transaction['status']) => {
    let className = '';
    let icon = null;
    switch (status) {
      case 'pending_input':
        className = 'bg-yellow-500 text-yellow-50';
        icon = <Clock className="mr-1 h-3 w-3" />;
        break;
      case 'completed':
        className = 'bg-blue-500 text-blue-50';
        icon = <CheckCircle className="mr-1 h-3 w-3" />;
        break;
      case 'approved':
        className = 'bg-green-500 text-green-50';
        icon = <CheckCircle className="mr-1 h-3 w-3" />;
        break;
      case 'declined':
        className = 'bg-red-500 text-red-50';
        icon = <XCircle className="mr-1 h-3 w-3" />;
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return (
      <Badge className={className}>
        {icon} {status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.replace(/_/g, ' ').slice(1)}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <ReceiptOff className="mr-2 h-6 w-6" /> Missing Receipts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions && transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Reason for Payment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>{format(new Date(transaction.transaction_date), 'PPP')}</TableCell>
                      <TableCell className="font-medium">{transaction.description}</TableCell>
                      <TableCell>{transaction.currency} {transaction.amount.toFixed(2)}</TableCell>
                      <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                      <TableCell>{transaction.sku || 'N/A'}</TableCell>
                      <TableCell>{transaction.reason_for_payment || 'N/A'}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/transaction/${transaction.id}`}>View/Add Receipt</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground mt-8">No transactions with missing receipts found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MissingReceipts;