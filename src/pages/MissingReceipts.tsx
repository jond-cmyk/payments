"use client";

import React, { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Transaction } from '@/types/supabase';
import { format } from 'date-fns';
import { FileText, CheckCircle, Clock, XCircle, FileX, Trash2 } from 'lucide-react';

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
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const MissingReceipts = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);

  const isAdmin = userProfile?.role === 'admin';

  // Fetch transactions assigned to the current user that are pending input and have no receipts
  const { data: transactions, isLoading: isTransactionsLoading, error: transactionsError } = useQuery<Transaction[]>({
    queryKey: ['missingReceipts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('status', 'pending_input') // Filter for pending input
        .eq('receipt_urls', '{}') // Filter for empty receipt_urls array
        .order('transaction_date', { ascending: false });

      // If not admin, filter by requester_id
      if (!isAdmin) {
        query = query.eq('requester_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) throw new Error("No transactions selected for deletion.");
      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('id', ids);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missingReceipts'] });
      setSelectedTransactionIds([]); // Clear selection after deletion
      // Optionally invalidate other relevant queries if needed, e.g., dashboard
      // queryClient.invalidateQueries({ queryKey: ['myTransactions'] });
      // queryClient.invalidateQueries({ queryKey: ['allTransactions'] });
    },
    onError: (error: any) => {
      console.error("Bulk delete error:", error);
      // Handle error, e.g., show a toast notification
    },
  });

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const allIds = transactions?.map(t => t.id) || [];
      setSelectedTransactionIds(allIds);
    } else {
      setSelectedTransactionIds([]);
    }
  }, [transactions]);

  const handleSelectTransaction = useCallback((id: string, checked: boolean) => {
    setSelectedTransactionIds(prev =>
      checked ? [...prev, id] : prev.filter(prevId => prevId !== id)
    );
  }, []);

  const handleDeleteSelected = async () => {
    // Trigger the mutation
    await bulkDeleteMutation.mutateAsync(selectedTransactionIds);
  };

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

  const allTransactionsSelected = transactions && transactions.length > 0 && selectedTransactionIds.length === transactions.length;
  const someTransactionsSelected = selectedTransactionIds.length > 0 && selectedTransactionIds.length < (transactions?.length || 0);

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center text-2xl font-bold">
              <FileX className="mr-2 h-6 w-6" /> Missing Receipts
            </CardTitle>
            {isAdmin && selectedTransactionIds.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={bulkDeleteMutation.isPending}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Selected ({selectedTransactionIds.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete {selectedTransactionIds.length} selected transactions and all associated data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteSelected} asChild>
                      <Button variant="destructive">
                        Delete
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {transactions && transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={allTransactionsSelected}
                          onCheckedChange={handleSelectAll}
                          indeterminate={someTransactionsSelected}
                          aria-label="Select all transactions"
                        />
                      </TableHead>
                    )}
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
                      {isAdmin && (
                        <TableCell>
                          <Checkbox
                            checked={selectedTransactionIds.includes(transaction.id)}
                            onCheckedChange={(checked: boolean) => handleSelectTransaction(transaction.id, checked)}
                            aria-label={`Select transaction ${transaction.id.substring(0, 8)}`}
                          />
                        </TableCell>
                      )}
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