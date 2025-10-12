"use client";

import React, { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Transaction, Profile } from '@/types/supabase'; // Import Profile type
import { format } from 'date-fns';
import { FileText, CheckCircle, Clock, XCircle, FileX, Trash2, UserPlus, ChevronLeft, ChevronRight } from 'lucide-react'; // Import ChevronLeft, ChevronRight
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast'; // Added missing import

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; // Import Select components
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationLink, PaginationNext } from '@/components/ui/pagination'; // Import shadcn/ui pagination components

const MissingReceipts = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // Default items per page

  const isAdmin = userProfile?.role === 'admin';

  // Fetch ALL transactions that are pending input and have no receipts
  const { data: transactions, isLoading: isTransactionsLoading, error: transactionsError, dataUpdatedAt } = useQuery<Transaction[]>({
    queryKey: ['missingReceipts', currentPage, itemsPerPage], // Include pagination in query key
    queryFn: async () => {
      if (!session) return []; // Only fetch if authenticated

      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage - 1;

      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact' }) // Request count for pagination
        .eq('status', 'pending_input') // Filter for pending input
        .eq('receipt_urls', '{}') // Filter for empty receipt_urls array
        .order('transaction_date', { ascending: false })
        .range(startIndex, endIndex); // Apply pagination range

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!session, // Enabled for any authenticated user
  });

  // Fetch total count for pagination
  const { data: totalTransactionsCount, isLoading: isCountLoading, error: countError } = useQuery<number>({
    queryKey: ['missingReceiptsCount'],
    queryFn: async () => {
      if (!session) return 0;
      const { count, error } = await supabase
        .from('transactions')
        .select('id', { count: 'exact' })
        .eq('status', 'pending_input')
        .eq('receipt_urls', '{}');
      if (error) throw error;
      return count || 0;
    },
    enabled: !!session,
    staleTime: 1000 * 60 * 5, // Cache count for 5 minutes
    refetchInterval: 1000 * 60 * 5, // Refetch count every 5 minutes
  });

  const totalPages = Math.ceil((totalTransactionsCount || 0) / itemsPerPage);

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
    enabled: !!session, // Only fetch if authenticated
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
      queryClient.invalidateQueries({ queryKey: ['missingReceiptsCount'] }); // Invalidate count
      setSelectedTransactionIds([]); // Clear selection after deletion
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
      queryClient.invalidateQueries({ queryKey: ['missingReceipts'] }); // Refresh the list
      queryClient.invalidateQueries({ queryKey: ['transactionAudits'] }); // Invalidate audits as well
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

  if (isSessionLoading || isTransactionsLoading || isProfilesLoading || isCountLoading) {
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

  if (countError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading transaction count: {countError.message}</div>;
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
            <p className="text-center text-muted-foreground mt-8">No transactions with missing receipts found.</p>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-8 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">Items per page:</span>
                <Select
                  value={String(itemsPerPage)}
                  onValueChange={(value) => {
                    setItemsPerPage(Number(value));
                    setCurrentPage(1); // Reset to first page when items per page changes
                  }}
                >
                  <SelectTrigger className="w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        isActive={currentPage === page}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MissingReceipts;