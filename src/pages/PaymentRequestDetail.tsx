"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PaymentRequest, PaymentRequestAudit, PaymentRequestCategoryItem } from '@/types/supabase';
import { showSuccess, showError, showLoading, dismissToast, showInfo } from '@/utils/toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { PauseCircle, DollarSign, AlertTriangle } from 'lucide-react'; // Import DollarSign

import { editFormSchema, EditFormSchema } from '@/schemas/paymentRequestSchema';
import PaymentRequestDisplayCards from '@/components/payment-requests/PaymentRequestDisplayCards';
import PaymentRequestEditFormCard from '@/components/payment-requests/PaymentRequestEditFormCard';

import AdminActionsCard from '@/components/payment-requests/AdminActionsCard';
import AdminReceiptUploadCard from '@/components/payment-requests/AdminReceiptUploadCard';
import PaymentRequestAuditTrailCard from '@/components/payment-requests/PaymentRequestAuditTrailCard';
import PaymentRequestCommentsCard from '@/components/payment-requests/PaymentRequestCommentsCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

// Zod schema for admin query note (kept here as it's admin-specific)
const queryFormSchema = z.object({
  query_note: z.string().min(1, "Query note is required"),
});

// Zod schema for admin receipt upload (kept here as it's admin-specific)
const receiptUploadSchema = z.object({
  receipt_pdf: z.any()
    .refine((file) => file?.length > 0, "Receipt PDF is required.")
    .refine((file) => file?.[0]?.size <= 5 * 1024 * 1024, "Max file size is 5MB.")
    .refine((file) => file?.[0]?.type === "application/pdf" || file?.[0]?.type === "image/jpeg" || file?.[0]?.type === "image/png", "Only .pdf, .jpg, .jpeg, .png files are accepted."),
});

// Zod schema for admin revert reason (kept here as it's admin-specific)
const revertFormSchema = z.object({
  revert_reason: z.string().min(1, "Revert reason is required"),
});


const PaymentRequestDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading, user, userProfile } = useSession();
  const { currentCountry, isCountryLocked, availableCountries, setCurrentCountry } = useCountry();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const userRole = userProfile?.role || null;

  // Fetch payment request details
  const { data: request, isLoading: isRequestLoading, error: requestError } = useQuery<PaymentRequest | null>({
    queryKey: ['paymentRequest', id, currentCountry],
    queryFn: async () => {
      if (!id) return null;
      let query = supabase
        .from('payment_requests')
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

  // Effect to auto-reset country filter if item not found
  useEffect(() => {
    if (!isRequestLoading && !request && currentCountry !== 'all' && userProfile?.role === 'admin') {
      showInfo("Country filter reset to 'All Countries' to show this item.");
      setCurrentCountry('all');
    }
  }, [isRequestLoading, request, currentCountry, setCurrentCountry, userProfile?.role]);

  // Fetch audit trail
  const { data: audits, isLoading: isAuditsLoading, error: auditsError } = useQuery<PaymentRequestAudit[]>({
    queryKey: ['paymentRequestAudits', id, currentCountry],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('payment_request_audits')
        .select('*')
        .eq('payment_request_id', id)
        // No country filter on audit table itself, as it references payment_requests
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Filter audits into general audit trail and comments
  const generalAudits = audits?.filter(audit => !audit.change_description.startsWith('Comment: ')) || [];
  const comments = audits?.filter(audit => audit.change_description.startsWith('Comment: ')) || [];


  // Fetch user names and emails for audit trail and comments
  const { data: auditUsers, isLoading: isAuditUsersLoading } = useQuery<Record<string, string>>({
    queryKey: ['auditUsers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_with_email')
        .select('id, first_name, last_name, user_email');
      
      if (error) throw error;
      const usersMap: Record<string, string> = {};
      data.forEach(profile => {
        let displayString = profile.user_email || profile.id; // Fallback
        if (profile.first_name || profile.last_name) {
          const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
          if (name) {
            displayString = name;
          }
        }
        usersMap[profile.id] = displayString;
      });
      return usersMap;
    },
    enabled: !!session,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (commentText: string) => {
      if (!id || !user?.id) throw new Error("Request ID or user ID missing.");
      const { error } = await supabase
        .from('payment_request_audits')
        .insert({
          payment_request_id: id,
          changed_by_user_id: user.id,
          change_description: `Comment: ${commentText}`,
        });
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentRequestAudits', id] });
      showSuccess("Comment added successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to add comment.");
      console.error("Add comment error:", error);
    },
  });

  const updateRequestMutation = useMutation({
    mutationFn: async (payload: Partial<PaymentRequest> & { new_invoice_files?: FileList }) => {
      if (!id || !user?.id) throw new Error("Request ID or user ID missing.");
  
      const { new_invoice_files, ...dbUpdateFields } = payload;
  
      // Handle file uploads separately
      if (new_invoice_files && new_invoice_files.length > 0) {
        const newUploadedUrls: string[] = [];
        for (let i = 0; i < new_invoice_files.length; i++) {
          const file = new_invoice_files[i];
          const fileExtension = file.name.split('.').pop();
          const fileName = `${user.id}/${crypto.randomUUID()}.${fileExtension}`;
  
          const { error: uploadError } = await supabase.storage
            .from('invoices')
            .upload(fileName, file);
  
          if (uploadError) throw new Error(`Failed to upload new invoice ${file.name}: ${uploadError.message}`);
  
          const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(fileName);
          if (!publicUrlData?.publicUrl) throw new Error(`Failed to get public URL for new invoice ${file.name}.`);
          newUploadedUrls.push(publicUrlData.publicUrl);
        }
        dbUpdateFields.invoice_pdf_urls = [...(request?.invoice_pdf_urls || []), ...newUploadedUrls];
      }
  
      // Always add the updated_at timestamp
      dbUpdateFields.updated_at = new Date().toISOString();
  
      const { data, error } = await supabase
        .from('payment_requests')
        .update(dbUpdateFields)
        .eq('id', id)
        .select();
      
      if (error) {
        console.error("Supabase update error:", error);
        throw new Error(`Supabase update failed: ${error.message} (Code: ${error.code}, Hint: ${error.hint})`);
      }
      
      if (!data || data.length === 0) {
        console.warn("Supabase update returned no data. This might be due to RLS preventing the update.");
        throw new Error("Update failed: No matching record found or insufficient permissions (RLS).");
      }
  
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentRequest', id] });
      queryClient.invalidateQueries({ queryKey: ['paymentRequestAudits', id] });
      queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] });
      queryClient.invalidateQueries({ queryKey: ['allPaymentRequestsForSummary'] });
      showSuccess("Payment request updated successfully!");
      setIsEditing(false);
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update payment request.");
      console.error("Update error:", error);
    },
  });

  const deleteRequestMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Request ID missing.");
      let query = supabase
        .from('payment_requests')
        .delete()
        .eq('id', id);
      
      // Apply country filter for delete
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        query = query.eq('country', currentCountry);
      }

      const { error } = await query;
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentRequests'] });
      queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] }); // Invalidate dashboard table
      queryClient.invalidateQueries({ queryKey: ['allPaymentRequestsForSummary'] }); // Invalidate summary cards
      showSuccess("Payment request deleted successfully!");
      navigate('/admin/requests');
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete payment request.");
      console.error("Delete error:", error);
    },
  });

  const handleRequesterEditSubmit = async (values: EditFormSchema) => {
    console.log("Form submitted with values:", values);
    const toastId = showLoading("Updating payment request...");
    try {
      if (!user?.id || !request) {
        throw new Error("User not authenticated or request data missing.");
      }

      const invoiceFiles: FileList = values.invoice_pdf;
      
      // FIX: Use original country if form value is missing (due to disabled field)
      const countryForUpdate = (values.country && values.country.trim() !== '') ? values.country : request.country;

      const updatedFields: Partial<PaymentRequest> & { new_invoice_files?: FileList } = {
        supplier_name: values.supplier_name,
        sku_number: values.not_sku_related ? null : values.sku_number,
        not_sku_related: values.not_sku_related,
        lease_id: values.lease_id || null,
        supplier_address: values.supplier_address,
        total_amount: values.total_amount,
        reason_for_payment: values.notes || null,
        date_payment_required: values.date_payment_required.toISOString().split('T')[0],
        receipt_required: values.receipt_required,
        is_urgent: values.is_urgent,
        country: countryForUpdate,
        categories: values.categories as PaymentRequestCategoryItem[],
        bank_details_verified: values.bank_details_verified,
      };

      // Set currency based on the determined country
      updatedFields.currency = countryForUpdate === 'United Kingdom' ? 'GBP' : values.currency;

      // Conditionally add bank details to updatedFields based on the determined country
      if (countryForUpdate === 'United Kingdom') {
        updatedFields.iban_number = null;
        updatedFields.sort_code = values.sort_code;
        updatedFields.account_number = values.account_number?.replace(/\s/g, '');
        updatedFields.bank_account_name = values.bank_account_name;
      } else {
        updatedFields.iban_number = values.iban_number;
        updatedFields.sort_code = null;
        updatedFields.account_number = null;
        updatedFields.bank_account_name = countryForUpdate === 'Switzerland' ? values.bank_account_name : null;
      }

      if (values.invoice_pdf && values.invoice_pdf.length > 0) {
        updatedFields.new_invoice_files = values.invoice_pdf;
      }

      await updateRequestMutation.mutateAsync(updatedFields);
      dismissToast(toastId);
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred during update.");
    }
  };

  const handleAdminAction = async (status: 'setup_awaiting_approval' | 'approved' | 'declined' | 'queried' | 'reverted_to_pending' | 'cancelled' | 'paused', reason?: string) => {
    const toastId = showLoading(`Setting status to ${status.replace(/_/g, ' ')}...`);
    try {
      if (!user?.id || !request) throw new Error("User or Request data missing.");

      if (status === 'declined' && reason) {
        await addCommentMutation.mutateAsync(`Declined: ${reason}`);
      }
      if (status === 'paused') {
        await addCommentMutation.mutateAsync(`Request paused by user.`);
      }
      if (status === 'cancelled') {
        await addCommentMutation.mutateAsync(`Request cancelled by user.`);
      }

      // *** NEW LOGIC: Call the RPC function ***
      const { error } = await supabase.rpc('update_payment_request_status', {
        request_id: id,
        new_status: status,
        user_id: user.id,
        reason: reason || null,
      });

      if (error) {
        console.error("RPC call error in handleAdminAction:", error);
        throw new Error(`RPC call failed: ${error.message}`);
      }

      // Manually handle success actions
      queryClient.invalidateQueries({ queryKey: ['paymentRequest', id] });
      queryClient.invalidateQueries({ queryKey: ['paymentRequestAudits', id] });
      queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] });
      queryClient.invalidateQueries({ queryKey: ['allPaymentRequestsForSummary'] });
      showSuccess("Payment request updated successfully!");
      setIsEditing(false);
      
      dismissToast(toastId);
      return true;
    } catch (error: any) {
      dismissToast(toastId);
      console.error("Error in handleAdminAction:", error);
      showError(error.message || `Failed to set status to ${status.replace(/_/g, ' ')}.`);
      return false;
    }
  };

  const handleAdminQuery = async (values: z.infer<typeof queryFormSchema>) => {
    const toastId = showLoading("Adding query note and updating status...");
    try {
      if (!id || !user?.id) throw new Error("Request ID or user ID missing.");

      await addCommentMutation.mutateAsync(values.query_note);
      await handleAdminAction('queried', values.query_note);
      
      dismissToast(toastId);
      showSuccess("Payment queried successfully!");
      return true;
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred during query.");
      console.error("Query payment error:", error);
      throw error;
    }
  };

  const handleAdminRevert = async (values: z.infer<typeof revertFormSchema>) => {
    const toastId = showLoading("Reverting payment request to pending...");
    try {
      if (!id || !user?.id) throw new Error("Request ID or user ID missing.");

      await addCommentMutation.mutateAsync(`Reverted to Pending: ${values.revert_reason}`);
      await handleAdminAction('reverted_to_pending', values.revert_reason);
      
      dismissToast(toastId);
      showSuccess("Payment request reverted to pending successfully!");
      return true;
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred during revert.");
      console.error("Revert payment error:", error);
      throw error;
    }
  };

  const handleAddComment = async (commentText: string) => {
    await addCommentMutation.mutateAsync(commentText);
  };

  const sendReminderMutation = useMutation({
    mutationFn: async () => {
      if (!id || !user?.id) throw new Error("Request ID or user ID missing.");
      const { data, error: invokeError } = await supabase.functions.invoke('send-reminder-notification', {
        body: { requestId: id, senderId: user.id },
      });

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentRequest', id] });
      queryClient.invalidateQueries({ queryKey: ['paymentRequestAudits', id] });
      queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] });
      queryClient.invalidateQueries({ queryKey: ['allPaymentRequestsForSummary'] });
      showSuccess("Reminder sent successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to send reminder.");
      console.error("Send reminder error:", error);
    },
  });

  const handleSendReminder = async () => {
    const toastId = showLoading("Sending reminder...");
    try {
      await sendReminderMutation.mutateAsync();
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };

  const handleReceiptUpload = async (values: z.infer<typeof receiptUploadSchema>) => {
    const toastId = showLoading("Uploading receipt...");
    try {
      if (!user?.id || !id) throw new Error("User or request ID missing.");

      const receiptFile = values.receipt_pdf[0];
      const fileExtension = receiptFile.name.split('.').pop();
      const fileName = `${id}/${crypto.randomUUID()}.${fileExtension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, receiptFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload receipt: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(fileName);

      if (!publicUrlData?.publicUrl) {
        throw new Error("Failed to get public URL for receipt.");
      }

      await updateRequestMutation.mutateAsync({ 
        receipt_pdf_url: publicUrlData.publicUrl
      });
      dismissToast(toastId);
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to upload receipt.");
    }
  };

  const handleUnpause = async () => {
    const toastId = showLoading("Unpausing request...");
    try {
      await addCommentMutation.mutateAsync("Request unpaused.");
      await updateRequestMutation.mutateAsync({ status: 'pending' });
      dismissToast(toastId);
      showSuccess("Request has been unpaused and returned to 'Pending' status.");
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to unpause request.");
    }
  };

  if (isLoading || isRequestLoading || isAuditsLoading || isAuditUsersLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading payment request...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (requestError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading request: {requestError.message}</div>;
  }

  if (!request) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Payment request not found.</div>;
  }

  // The `canAmend` logic now allows any authenticated user to amend pending or queried requests
  const canAmend = !!user && (request.status === 'pending' || request.status === 'queried');
  const isAdmin = userRole === 'admin';
  // const isRequester = !!user; // Removed unused variable

  return (
    <div className="container mx-auto py-8">
      {request.is_deposit_return && (
        <Card className="mb-8 bg-green-600 text-white border-none shadow-lg">
          <CardHeader className="p-6">
            <div className="flex items-center gap-4">
              <AlertTriangle className="h-10 w-10 flex-shrink-0" />
              <div>
                <CardTitle className="text-2xl font-extrabold">
                  Customer Deposit Return
                </CardTitle>
                <CardDescription className="text-green-100 text-base mt-1">
                  This is a high-priority repayment to a customer for their deposit. Please handle with care and process promptly.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {request.status === 'paused' && (
        <Card className="mb-8 bg-yellow-50 border-l-4 border-yellow-400 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center text-yellow-800">
              <PauseCircle className="mr-3 h-6 w-6" />
              Payment Request Paused
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-yellow-700">This request is currently paused. No further actions can be taken until it is unpaused.</p>
            <Button onClick={handleUnpause} disabled={updateRequestMutation.isPending} className="w-full sm:w-auto bg-yellow-600 hover:bg-yellow-700 text-white flex-shrink-0">
              Unpause Request
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Payment Request #{request.id.substring(0, 8)}</h1>
        {canAmend && !isEditing && (
          <Button onClick={() => setIsEditing(true)} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm">
            Amend Request
          </Button>
        )}
        {isEditing && (
          <div className="space-x-2">
            <Button variant="outline" onClick={() => { setIsEditing(false); }} className="shadow-sm">
              Cancel
            </Button>
            <Button 
              form="edit-request-form" 
              type="submit" 
              className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm"
              disabled={updateRequestMutation.isPending}
            >
              Save Changes
            </Button>
          </div>
        )}
      </div>

      <AdminActionsCard
        request={request}
        isAdmin={isAdmin}
        updateRequestMutation={updateRequestMutation}
        deleteRequestMutation={deleteRequestMutation}
        handleAdminAction={handleAdminAction}
        handleAdminQuery={handleAdminQuery}
        handleAdminRevert={handleAdminRevert}
        handleSendReminder={handleSendReminder}
        isSendingReminder={sendReminderMutation.isPending}
        user={user}
      />

      {/* Conditional rendering based on isEditing state */}
      {isEditing ? (
        <PaymentRequestEditFormCard
          key={request.id}
          request={request}
          handleRequesterEditSubmit={handleRequesterEditSubmit}
        />
      ) : (
        <PaymentRequestDisplayCards
          request={request}
          auditUsers={auditUsers}
        />
      )}

      <AdminReceiptUploadCard
        request={request}
        isAdmin={isAdmin}
        updateRequestMutation={updateRequestMutation}
        handleReceiptUpload={handleReceiptUpload}
      />

      <PaymentRequestCommentsCard
        paymentRequestId={request.id}
        comments={comments}
        auditUsers={auditUsers}
        isAdmin={isAdmin}
        request={request}
        currentUser={user}
        onAddComment={handleAddComment}
        isAddingComment={addCommentMutation.isPending}
      />

      <PaymentRequestAuditTrailCard
        audits={generalAudits}
        auditUsers={auditUsers}
      />
    </div>
  );
};

export default PaymentRequestDetail;