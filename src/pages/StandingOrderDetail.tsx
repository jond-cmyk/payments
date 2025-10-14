"use client";

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StandingOrder } from '@/types/supabase';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { format } from 'date-fns';
import { Edit, Trash2, Repeat, Eye } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import EditStandingOrderForm from '@/components/standing-orders/EditStandingOrderForm';
import { cn } from '@/lib/utils';

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
      navigate('/standing-orders'); // Navigate back to the list after deletion
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
      default:
        className = 'bg-gray-500 text-gray-50';
    }
    return (
      <Badge className={cn(className, "transform translate-x-0 translate-y-0")}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const handleStandingOrderUpdated = () => {
    setIsEditStandingOrderDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['standingOrder', id] }); // Invalidate detail page query
    queryClient.invalidateQueries({ queryKey: ['standingOrders'] }); // Invalidate list page query
  };

  if (isSessionLoading || isStandingOrderLoading) {
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

      <Card className="mb-8 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Repeat className="mr-2 h-5 w-5" /> Standing Order Details
          </CardTitle>
          <CardDescription>Detailed information about this standing order.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium">Payee:</p>
              <p>{standingOrder.payee}</p>
            </div>
            <div>
              <p className="font-medium">Payment Start Date:</p>
              <p>{format(new Date(standingOrder.payment_date), 'PPP')}</p>
            </div>
            <div>
              <p className="font-medium">SKU:</p>
              <p>{standingOrder.not_property_related ? 'N/A (Not Property Related)' : (standingOrder.sku || 'N/A')}</p>
            </div>
            <div>
              <p className="font-medium">Category:</p>
              <p>{categoryOptions.find(c => c.value === standingOrder.category)?.label || standingOrder.category}</p>
            </div>
            <div>
              <p className="font-medium">Account Name:</p>
              <p>{standingOrder.account_name}</p>
            </div>
            {standingOrder.country === 'United Kingdom' ? (
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
              </>
            )}
            <div>
              <p className="font-medium">Accruals Period:</p>
              <p>Day {standingOrder.from_day} to Day {standingOrder.to_day}</p>
            </div>
            <div>
              <p className="font-medium">Payment Reference:</p>
              <p>{standingOrder.payment_reference}</p>
            </div>
            <div>
              <p className="font-medium">Status:</p>
              <p>{getStatusBadge(standingOrder.status)}</p>
            </div>
            <div>
              <p className="font-medium">Country:</p>
              <p>{standingOrder.country}</p>
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

      {standingOrder && (
        <Dialog open={isEditStandingOrderDialogOpen} onOpenChange={setIsEditStandingOrderDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto"> {/* Adjusted max-w-lg */}
            <DialogHeader>
              <DialogTitle>Edit Standing Order: {standingOrder.payee}</DialogTitle>
            </DialogHeader>
            <EditStandingOrderForm standingOrder={standingOrder} onStandingOrderUpdated={handleStandingOrderUpdated} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default StandingOrderDetail;