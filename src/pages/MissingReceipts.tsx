"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Transaction, Profile } from '@/types/supabase';
import { format } from 'date-fns';
import { FileText, CheckCircle, Clock, XCircle, FileX, Trash2, UserPlus, Filter, RotateCcw } from 'lucide-react'; // Added Filter and RotateCcw icons
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input'; // Import Input for amount filter
import DatePicker from '@/components/DatePicker'; // Import DatePicker for date filter

const MissingReceipts = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);

  // Filter states
  const [filterAmount, setFilterAmount] = useState<string>('');
  const [filterAssignedUser, setFilterAssignedUser] = useState<string>('all'); // 'all' or user_id
  const [filterTransactionDate, setFilterTransactionDate] = useState<Date | undefined>(undefined);

  // Debounce for amount input
  const debounceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAmountFilterChange = useCallback((value: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      setFilterAmount(value);
    }, 300); // 300ms debounce
  }, []);

  const isAdmin = userProfile?.role === 'admin';

  // Fetch ALL transactions that are pending input and have no receipts
  const { data: transactions, isLoading: isTransactionsLoading, error: transactionsError } = useQuery<Transaction[]>({
    queryKey: ['missingReceipts', filterAmount, filterAssignedUser, filterTransactionDate], // Include filters in query key
    queryFn: async () => {
      if (!session) return [];

      console.log(`[MissingReceipts Query] Fetching with filters: amount=${filterAmount}, assignedUser=${filterAssignedUser}, date=${filterTransactionDate?.toISOString().split('T')[0]}`);

      let query = supabase
        .from('transactions')
        .select('*')
        .eq('status', 'pending_input')
        .eq('receipt_urls', '{}')
        .order('transaction_date', { ascending: false });

      // Temporarily disable dynamic filters for debugging
      // if (filterAmount) {
      //   const amountNum = parseFloat(filterAmount);
      //   if (!isNaN(amountNum)) {
      //     query = query.eq('amount', amountNum);
      //   }
      // }

      // if (filterAssignedUser !== 'all') {
      //   query = query.eq('requester_id', filterAssignedUser);
      // }

      // if (filterTransactionDate) {
      //   query = query.eq('transaction_date', format(filterTransactionDate, 'yyyy-MM-dd'));
      // }

      const { data, error } = await query;
      if (error) throw error;
      console.log(`[MissingReceipts Query] Fetched ${data?.length || 0} transactions. First transaction: ${JSON.stringify(data?.[0])}`);
      return data;
    },
    enabled: !!session,
  });

  // Fetch all user profiles for the assignee dropdown
  const { data: allProfiles, isLoading: isProfilesLoading, error: profilesError } = useQuery<Profile[]>({
    queryKey: ['allProfilesForAssignment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_with_email')
        .select('id, first_name, last_name, user_email')
        .order('first_name', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!session,
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
      setSelectedTransactionIds([]);
      showSuccess("Selected transactions deleted successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete selected transactions.");
      console.error("Bulk delete error:", error);
    },
  });

  const assignTransactionMutation = useMutation({
    mutationFn: async ({ transactionId, newRequesterId }: { transactionId: string; newRequesterId: string }) => {
      const { error } = await supabase
        .from('transactions')
        .update({ requester_id: newRequesterId, updated_at: new Date().toISOString() })
        .eq('id', transactionId);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      console.log("Transaction reassigned successfully. Invalidating 'missingReceipts' query.");
      console.log("Current filterAssignedUser:", filterAssignedUser); // Log current filter state
      queryClient.invalidateQueries({ queryKey: ['missingReceipts'] });
      queryClient.invalidateQueries({ queryKey: ['transactionAudits'] });
      showSuccess("Transaction reassigned successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to reassign transaction.");
      console.error("Reassign transaction error:", error);
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
    const toastId = showLoading("Deleting selected transactions...");
    try {
      await bulkDeleteMutation.mutateAsync(selectedTransactionIds);
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };

  const handleAssignTransaction = async (transactionId: string, newRequesterId: string) => {
    const toastId = showLoading("Reassigning transaction...");
    try {
      await assignTransactionMutation.mutateAsync({ transactionId, newRequesterId });
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };

  const clearFilters = () => {
    setFilterAmount('');
    setFilterAssignedUser('all');
    setFilterTransactionDate(undefined);
    queryClient.invalidateQueries({ queryKey: ['missingReceipts'] }); // Force refetch
  };

  const hasActiveFilters = filterAmount !== '' || filterAssignedUser !== 'all' || filterTransactionDate !== undefined;

  if (isSessionLoading || isTransactionsLoading || isProfilesLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading missing receipts...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (transactionsError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading missing receipts: {transactionsError.message}</div>;
  }

  if (profilesError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading user profiles: {profilesError.message}</div>;
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
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-4 p-4 border rounded-md bg-gray-50">
            <span className="font-medium text-gray-700">Filters:</span>
            <Input
              placeholder="Filter by Amount"
              type="number"
              step="0.01"
              value={filterAmount}
              onChange={(e) => handleAmountFilterChange(e.target.value)}
              className="max-w-xs"
            />
            <Select value={filterAssignedUser} onValueChange={setFilterAssignedUser}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Assigned User" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {allProfiles?.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.first_name || ''} {profile.last_name || ''} ({profile.user_email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DatePicker
              date={filterTransactionDate}
              setDate={setFilterTransactionDate}
              placeholder="Filter by Date"
              className="w-[200px]"
            />
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="flex items-center gap-1">
                <RotateCcw className="h-4 w-4" /> Clear Filters
              </Button>
            )}
          </div>

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
                    <TableHead>Assigned To</TableHead>
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
                      <TableCell>
                        <Select
                          value={transaction.requester_id || ''}
                          onValueChange={(newRequesterId) => handleAssignTransaction(transaction.id, newRequesterId)}
                          disabled={assignTransactionMutation.isPending}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Assign User" />
                          </SelectTrigger>
                          <SelectContent>
                            {allProfiles?.map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                {profile.first_name || ''} {profile.last_name || ''} ({profile.user_email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
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
            <p className="text-center text-muted-foreground mt-8">No transactions with missing receipts found matching your criteria.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MissingReceipts;