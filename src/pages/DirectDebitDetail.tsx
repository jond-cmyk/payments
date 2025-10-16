"use client";

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DirectDebit, DirectDebitAudit, Profile } from '@/types/supabase'; // Import DirectDebitAudit and Profile
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { format } from 'date-fns';
import { Edit, Trash2, Banknote, AlertTriangle } from 'lucide-react';
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
import EditDirectDebitForm from '@/components/direct-debits/EditDirectDebitForm'; // Import the EditDirectDebitForm

const DirectDebitDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
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

      const { data, error } = await query.single();
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
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return (
      <Badge className={cn(className, "transform translate-x-0 translate-y-0")}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
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

      <Card className="mb-8 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Banknote className="mr-2 h-5 w-5" /> Direct Debit Details
          </CardTitle>
          <CardDescription>Detailed information about this direct debit.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium">Payee:</p>
              <p>{directDebit.payee}</p>
            </div>
            <div>
              <p className="font-medium">Payment Date:</p>
              <p>{format(new Date(directDebit.payment_date), 'PPP')}</p>
            </div>
            <div>
              <p className="font-medium">SKU:</p>
              <p>{directDebit.not_property_related ? 'N/A (Not Property Related)' : (directDebit.sku || 'N/A')}</p>
            </div>
            <div>
              <p className="font-medium">Category:</p>
              <p>{categoryOptions.find(c => c.value === directDebit.category)?.label || directDebit.category}</p>
            </div>
            <div>
              <p className="font-medium">Account Number:</p>
              <p>{directDebit.account_number}</p>
            </div>
            <div>
              <p className="font-medium">Payment Reference:</p>
              <p>{directDebit.payment_reference}</p>
            </div>
            <div>
              <p className="font-medium">Status:</p>
              <p>{getStatusBadge(directDebit.status)}</p>
            </div>
            <div>
              <p className="font-medium">Country:</p>
              <p>{directDebit.country}</p>
            </div>
            {directDebit.bank_account && (
              <div>
                <p className="font-medium">Bank Account:</p>
                <p>{directDebit.bank_account}</p>
              </div>
            )}
            <div>
              <p className="font-medium">Created At:</p>
              <p>{format(new Date(directDebit.created_at), 'PPP p')}</p>
            </div>
            <div>
              <p className="font-medium">Last Updated:</p>
              <p>{format(new Date(directDebit.updated_at), 'PPP p')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <DirectDebitAuditTrailCard audits={audits} auditUsers={auditUsers} />

      {/* Add the Edit Direct Debit Dialog */}
      {editingDirectDebit && (
        <Dialog open={isEditDirectDebitDialogOpen} onOpenChange={setIsEditDirectDebitDialogOpen}>
          <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Direct Debit: {editingDirectDebit.payee}</DialogTitle>
            </DialogHeader>
            <EditDirectDebitForm directDebit={editingDirectDebit} onDirectDebitUpdated={handleDirectDebitUpdated} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default DirectDebitDetail;