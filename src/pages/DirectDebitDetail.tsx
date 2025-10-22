"use client";

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DirectDebit, DirectDebitAudit, Profile } from '@/types/supabase'; // Import DirectDebitAudit and Profile
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { format } from 'date-fns';
import { Edit, Trash2, Banknote, Info, CalendarDays, UserCircle2, MessageSquareText } from 'lucide-react'; // Added new icons for sections
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'; // Import Dialog components
import { cn } from '@/lib/utils';
import DirectDebitAuditTrailCard from '@/components/direct-debits/DirectDebitAuditTrailCard'; // Import the new audit card
import DirectDebitCommentsCard from '@/components/direct-debits/DirectDebitCommentsCard'; // NEW: Import DirectDebitCommentsCard
import EditDirectDebitForm from '@/components/direct-debits/EditDirectDebitForm'; // Import the EditDirectDebitForm

const DirectDebitDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession(); // Added user
  const { currentCountry } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isAdmin = userProfile?.role === 'admin';

  // Add state for the edit dialog
  const [isEditDirectDebitDialogOpen, setIsEditDirectDebitDialogOpen] = React.useState(false);
  const [editingDirectDebit, setEditingDirectDebit] = React.useState<DirectDebit | null>(null);

  // Fetch Direct Debit details
  const { data: directDebit, isLoading: isDirectDebitLoading, error: directDebitError } = useQuery<DirectDebit | null>({
    queryKey: ['directDebit', id, currentCountry],
    queryFn: async () => {
      if (!id) return null;
      let query = supabase
        .from('direct_debits')
        .select('*')
        .eq('id', id);

      // Apply country filter based on user role and selected country
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch audit trail
  const { data: audits, isLoading: isAuditsLoading, error: auditsError } = useQuery<DirectDebitAudit[]>({
    queryKey: ['directDebitAudits', id, currentCountry],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('direct_debit_audits')
        .select('*')
        .eq('direct_debit_id', id)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Filter audits into general audit trail and comments
  const generalAudits = audits?.filter(audit => !audit.change_description.startsWith('Comment: ')) || [];
  const comments = audits?.filter(audit => audit.change_description.startsWith('Comment: ')) || [];

  // Fetch user names and emails for audit trail
  const { data: auditUsers, isLoading: isAuditUsersLoading } = useQuery<Record<string, string>>({
    queryKey: ['auditUsers', currentCountry],
    queryFn: async () => {
      let query = supabase
        .from('profile_with_email')
        .select('id, first_name, last_name, user_email');
      
      if (currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query;
      if (error) throw error;
      const usersMap: Record<string, string> = {};
      data.forEach(profile => {
        let displayString = profile.user_email || profile.id;
        if (profile.first_name || profile.last_name) {
          const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
          if (profile.user_email) {
            displayString = `${name} (${profile.user_email})`;
          } else {
            displayString = name;
          }
        }
        usersMap[profile.id] = displayString;
      });
      return usersMap;
    },
    enabled: !!session,
  });

  const deleteDirectDebitMutation = useMutation({
    mutationFn: async (directDebitId: string) => {
      const { error } = await supabase
        .from('direct_debits')
        .delete()
        .eq('id', directDebitId);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directDebits'] });
      showSuccess("Direct Debit deleted successfully!");
      navigate('/direct-debits'); // Navigate back to the list after deletion
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete Direct Debit.");
      console.error("Delete Direct Debit error:", error);
    },
  });

  // NEW: Mutation for adding comments
  const addCommentMutation = useMutation({
    mutationFn: async (commentText: string) => {
      if (!id || !user?.id) throw new Error("Direct Debit ID or user ID missing.");
      const { error } = await supabase
        .from('direct_debit_audits')
        .insert({
          direct_debit_id: id,
          changed_by_user_id: user.id,
          change_description: `Comment: ${commentText}`,
        });
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directDebitAudits', id] });
      showSuccess("Comment added successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to add comment.");
      console.error("Add comment error:", error);
    },
  });

  const handleAddComment = async (commentText: string) => {
    const toastId = showLoading("Adding comment...");
    try {
      await addCommentMutation.mutateAsync(commentText);
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };

  const getStatusBadge = (status: DirectDebit['status']) => {
    let className = '';
    switch (status) {
      case 'active':
        className = 'bg-green-500 text-green-50';
        break;
      case 'paused':
        className = 'bg-yellow-500 text-yellow-50';
        break;
      case 'cancelled':
        className = 'bg-red-500 text-red-50';
        break;
      case 'pending':
      case 'awaiting_info': // Added awaiting_info
        className = 'bg-orange-500 text-orange-50';
        break;
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return (
      <Badge className={cn(className, "transform translate-x-0 translate-y-0")}>
        {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')}
      </Badge>
    );
  };

  const handleEditClick = (debit: DirectDebit) => {
    setEditingDirectDebit(debit);
    setIsEditDirectDebitDialogOpen(true);
  };

  const handleDirectDebitUpdated = () => {
    setIsEditDirectDebitDialogOpen(false);
    setEditingDirectDebit(null);
    queryClient.invalidateQueries({ queryKey: ['directDebits'] }); // Invalidate list
    queryClient.invalidateQueries({ queryKey: ['directDebit', id] }); // Invalidate detail view
    queryClient.invalidateQueries({ queryKey: ['directDebitAudits', id] }); // Invalidate audits
  };

  if (isSessionLoading || isDirectDebitLoading || isAuditsLoading || isAuditUsersLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading direct debit details...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (directDebitError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading direct debit: {directDebitError.message}</div>;
  }

  if (!directDebit) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Direct debit not found.</div>;
  }

  const isCH = directDebit.country === 'Switzerland';

  return (
    <div className="container mx-auto py-8">
      <PageTitle title={`Direct Debit ${directDebit.payee} - KH Payments`} />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Direct Debit #{directDebit.id.substring(0, 8)}</h1>
        {isAdmin && (
          <div className="flex space-x-2">
            <Button
              variant="outline"
              className="shadow-sm"
              onClick={() => handleEditClick(directDebit)}
            >
              <Edit className="mr-2 h-4 w-4" /> Edit Direct Debit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="shadow-sm"
                  disabled={deleteDirectDebitMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Direct Debit
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the direct debit for <strong>{directDebit.payee}</strong>.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteDirectDebitMutation.mutate(directDebit.id)} asChild>
                    <Button variant="destructive">
                      Delete
                    </Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Section 1: Overview (Now includes Supplier Account Number) */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Info className="mr-2 h-5 w-5" /> Overview
            </CardTitle>
            <CardDescription>Key details of the direct debit.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-bold">Country:</p>
                <p>{directDebit.country}</p>
              </div>
              <div>
                <p className="font-bold">Status:</p>
                <p>{getStatusBadge(directDebit.status)}</p>
              </div>
              <div className="md:col-span-2">
                <p className="font-bold">Payee:</p>
                <p>{directDebit.payee}</p>
              </div>
              <div>
                <p className="font-bold">SKU:</p>
                <p>{directDebit.not_property_related ? 'N/A (Not Property Related)' : (directDebit.sku || 'N/A')}</p>
              </div>
              <div>
                <p className="font-bold">Supplier Account Number:</p>
                <p>{directDebit.account_number || 'N/A'}</p>
              </div>
              {isCH && (
                <div>
                  <p className="font-bold">Bank Account:</p>
                  <p>{directDebit.bank_account || 'N/A'}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Payment Details (Now includes Payment Day) */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center">
              <CalendarDays className="mr-2 h-5 w-5" /> Payment Details
            </CardTitle>
            <CardDescription>Information about the payment structure.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-bold">Payment Day:</p>
                <p>{directDebit.payment_day !== null && directDebit.payment_day !== undefined ? `Day ${directDebit.payment_day}` : 'N/A'}</p>
              </div>
              <div>
                <p className="font-bold">Category:</p>
                <p>{categoryOptions.find(c => c.value === directDebit.category)?.label || directDebit.category}</p>
              </div>
              <div>
                <p className="font-bold">Payment Reference:</p>
                <p>{directDebit.payment_reference || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Metadata */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center">
              <UserCircle2 className="mr-2 h-5 w-5" /> Metadata
            </CardTitle>
            <CardDescription>Administrative information.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-bold">Requested By:</p>
                <p>{auditUsers?.[directDebit.requester_id] || directDebit.requester_id}</p>
              </div>
              <div>
                <p className="font-bold">Created At:</p>
                <p>{format(new Date(directDebit.created_at), 'PPP p')}</p>
              </div>
              <div>
                <p className="font-bold">Last Updated:</p>
                <p>{format(new Date(directDebit.updated_at), 'PPP p')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* NEW: Comments Card */}
      <DirectDebitCommentsCard
        directDebitId={directDebit.id}
        comments={comments}
        auditUsers={auditUsers}
        currentUser={user}
        onAddComment={handleAddComment}
        isAddingComment={addCommentMutation.isPending}
      />

      <DirectDebitAuditTrailCard audits={generalAudits} auditUsers={auditUsers || {}} />

      {directDebit && (
        <Dialog open={isEditDirectDebitDialogOpen} onOpenChange={setIsEditDirectDebitDialogOpen}>
          <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Direct Debit: {directDebit.payee}</DialogTitle>
            </DialogHeader>
            <EditDirectDebitForm directDebit={directDebit} onDirectDebitUpdated={handleDirectDebitUpdated} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default DirectDebitDetail;