"use client";

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StandingOrder, StandingOrderAudit } from '@/types/supabase';
import { showSuccess, showError } from '@/utils/toast';
import { format } from 'date-fns';
import { Edit, Trash2, Repeat, DollarSign, Info, Banknote, CalendarDays, UserCircle2 } from 'lucide-react'; // Added new icons for sections
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import UpdateStandingOrderForm from '@/components/standing-orders/UpdateStandingOrderForm';
import StandingOrderAuditTrailCard from '@/components/standing-orders/StandingOrderAuditTrailCard';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { formatAmount } from '@/components/economic/EconomicDetailDialog'; // Import formatAmount

const StandingOrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const { currentCountry } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditStandingOrderDialogOpen, setIsEditStandingOrderDialogOpen] = useState(false);

  const isAdmin = userProfile?.role === 'admin';

  // Fetch Standing Order details
  const { data: standingOrder, isLoading: isStandingOrderLoading, error: standingOrderError } = useQuery<StandingOrder | null>({
    queryKey: ['standingOrder', id, currentCountry],
    queryFn: async () => {
      if (!id) return null;
      let query = supabase
        .from('standing_orders')
        .select('*')
        .eq('id', id);

      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { data, error } = await query.single();
      if (error) throw error;
      return data as StandingOrder;
    },
    enabled: !!id,
  });

  // Fetch audit trail
  const { data: audits, isLoading: isAuditsLoading, error: auditsError } = useQuery<StandingOrderAudit[]>({
    queryKey: ['standingOrderAudits', id, currentCountry],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('standing_order_audits')
        .select('*')
        .eq('standing_order_id', id)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return data as StandingOrderAudit[];
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
      (data || []).forEach((profile: any) => {
        let displayString = profile.user_email || profile.id;
        if (profile.first_name || profile.last_name) {
          const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
          displayString = profile.user_email ? `${name} (${profile.user_email})` : name;
        }
        usersMap[profile.id] = displayString;
      });
      return usersMap;
    },
    enabled: !!session,
  });

  const deleteStandingOrderMutation = useMutation({
    mutationFn: async (standingOrderId: string) => {
      const { error } = await supabase
        .from('standing_orders')
        .delete()
        .eq('id', standingOrderId);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
      showSuccess("Standing Order deleted successfully!");
      navigate('/standing-orders');
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete Standing Order.");
      console.error("Delete Standing Order error:", error);
    },
  });

  const getStatusBadge = (status: StandingOrder['status']) => {
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

  const handleStandingOrderUpdated = () => {
    setIsEditStandingOrderDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['standingOrder', id] });
    queryClient.invalidateQueries({ queryKey: ['standingOrders'] });
    queryClient.invalidateQueries({ queryKey: ['pendingStandingOrders'] });
  };

  if (isSessionLoading || isStandingOrderLoading || isAuditsLoading || isAuditUsersLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading standing order details...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (standingOrderError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading standing order: {standingOrderError.message}</div>;
  }

  if (!standingOrder) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Standing order not found.</div>;
  }

  const isUK = standingOrder.country === 'United Kingdom';
  const isCH = standingOrder.country === 'Switzerland';

  return (
    <div className="container mx-auto py-8">
      <PageTitle title={`Standing Order ${standingOrder.payee} - KH Payments`} />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Standing Order #{standingOrder.id.substring(0, 8)}</h1>
        {isAdmin && (
          <div className="flex space-x-2">
            <Button variant="outline" className="shadow-sm" onClick={() => setIsEditStandingOrderDialogOpen(true)}>
              <Edit className="mr-2 h-4 w-4" /> Edit Standing Order
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="shadow-sm"
                  disabled={deleteStandingOrderMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Standing Order
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the standing order for <strong>{standingOrder.payee}</strong>.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteStandingOrderMutation.mutate(standingOrder.id)} asChild>
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
        {/* Section 1: Overview */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Info className="mr-2 h-5 w-5" /> Overview
            </CardTitle>
            <CardDescription>Key details of the standing order.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium">Country:</p>
                <p>{standingOrder.country}</p>
              </div>
              <div>
                <p className="font-medium">Status:</p>
                <p>{getStatusBadge(standingOrder.status)}</p>
              </div>
              <div className="md:col-span-2">
                <p className="font-medium">Payee:</p>
                <p>{standingOrder.payee}</p>
              </div>
              <div>
                <p className="font-medium">Payment Start Date:</p>
                <p>{format(new Date(standingOrder.payment_date), 'PPP')}</p>
              </div>
              <div>
                <p className="font-medium">Payment End Date:</p>
                <p>{standingOrder.payment_end_date ? format(new Date(standingOrder.payment_end_date), 'PPP') : 'No end date'}</p>
              </div>
              <div>
                <p className="font-medium">Payment Day:</p>
                <p>{standingOrder.payment_day ? `Day ${standingOrder.payment_day}` : 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Payment Details */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center">
              <DollarSign className="mr-2 h-5 w-5" /> Payment Details
            </CardTitle>
            <CardDescription>Information about the payment structure.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="md:col-span-2">
                <p className="font-medium flex items-center">
                  Categories & Amounts:
                </p>
                {standingOrder.categories && standingOrder.categories.length > 0 ? (
                  <div className="space-y-1 mt-1">
                    {standingOrder.categories.map((cat, index) => (
                      <p key={index} className="ml-2">
                        - {categoryOptions.find(c => c.value === cat.category)?.label || cat.category}: {formatAmount(cat.amount)}
                      </p>
                    ))}
                    <Separator className="my-2" />
                    <p className="font-bold text-base">Total Amount: {formatAmount(standingOrder.total_amount)}</p>
                  </div>
                ) : (
                  <p className="ml-2">No categories defined.</p>
                )}
              </div>
              <div>
                <p className="font-medium">SKU:</p>
                <p>{standingOrder.not_property_related ? 'N/A (Not Property Related)' : (standingOrder.sku || 'N/A')}</p>
              </div>
              <div>
                <p className="font-medium">Accruals Period:</p>
                <p>Day {standingOrder.from_day} to Day {standingOrder.to_day}</p>
              </div>
              <div>
                <p className="font-medium">Payment Reference:</p>
                <p>{standingOrder.payment_reference || 'N/A'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="font-medium">Comments:</p>
                <p>{standingOrder.comments || 'No comments'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Bank Details */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Banknote className="mr-2 h-5 w-5" /> Bank Details
            </CardTitle>
            <CardDescription>Account information for the payee.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium">Account Name:</p>
                <p>{standingOrder.account_name || 'N/A'}</p>
              </div>
              {isUK ? (
                <>
                  <div>
                    <p className="font-medium">Sort Code:</p>
                    <p>{standingOrder.sort_code || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="font-medium">Account Number:</p>
                    <p>{standingOrder.account_number ? standingOrder.account_number.replace(/(\d{4})(\d{4})/, '$1 $2') : 'N/A'}</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="font-medium">Account Address:</p>
                    <p>{standingOrder.account_address || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="font-medium">IBAN Number:</p>
                    <p>{standingOrder.iban_number || 'N/A'}</p>
                  </div>
                  {isCH && (
                    <>
                      <div>
                        <p className="font-medium">Bank Account:</p>
                        <p>{standingOrder.bank_account || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="font-medium">Currency:</p>
                        <p>{standingOrder.currency || 'N/A'}</p>
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="md:col-span-2">
                <p className="font-medium">Bank Details Verified:</p>
                <p>{standingOrder.bank_details_verified ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Metadata */}
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
                <p className="font-medium">Requested By:</p>
                <p>{auditUsers?.[standingOrder.requester_id] || standingOrder.requester_id}</p>
              </div>
              <div>
                <p className="font-medium">Created At:</p>
                <p>{format(new Date(standingOrder.created_at), 'PPP p')}</p>
              </div>
              <div>
                <p className="font-medium">Last Updated:</p>
                <p>{format(new Date(standingOrder.updated_at), 'PPP p')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <StandingOrderAuditTrailCard audits={audits} auditUsers={auditUsers || {}} />

      {standingOrder && (
        <Dialog open={isEditStandingOrderDialogOpen} onOpenChange={setIsEditStandingOrderDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Standing Order: {standingOrder.payee}</DialogTitle>
            </DialogHeader>
            <UpdateStandingOrderForm standingOrder={standingOrder} onStandingOrderUpdated={handleStandingOrderUpdated} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default StandingOrderDetail;