"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PaymentRequest, PaymentRequestAudit, PaymentRequestCategoryItem } from '@/types/supabase';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCountry } from '@/integrations/supabase/CountryContext';

import { editFormSchema, EditFormSchema } from '@/schemas/paymentRequestSchema';
import PaymentRequestDisplayCards from '@/components/payment-requests/PaymentRequestDisplayCards';
import PaymentRequestEditFormCard from '@/components/payment-requests/PaymentRequestEditFormCard';

import AdminActionsCard from '@/components/payment-requests/AdminActionsCard';
import AdminReceiptUploadCard from '@/components/payment-requests/AdminReceiptUploadCard';
import PaymentRequestAuditTrailCard from '@/components/payment-requests/PaymentRequestAuditTrailCard';
import PaymentRequestCommentsCard from '@/components/payment-requests/PaymentRequestCommentsCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

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
  const { currentCountry, isCountryLocked, availableCountries } = useCountry();
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

      const { data, error } = await query.single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

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
    queryKey: ['auditUsers', currentCountry],
    queryFn: async () => {
      let query = supabase
        .from('profile_with_email')
        .select('id, first_name, last_name, user_email');
      
      // Filter profiles by selected country if not 'all'
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

  // Form for editing (requester/admin)
  const editForm = useForm<EditFormSchema>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      supplier_name: "",
      sku_number: "CH", // Default for PrefixedInput
      not_sku_related: false, // Default to false
      lease_id: "", // Default for new field
      supplier_address: "",
      iban_number: "",
      sort_code: "",
      account_number: "",
      bank_account_name: "",
      currency: "CHF", // Default to CHF
      total_amount: 0.00,
      notes: "", // CHANGED: Default to notes
      date_payment_required: undefined,
      invoice_pdf: undefined,
      receipt_required: false,
      is_urgent: false, // Default to not urgent
      country: request?.country || "Switzerland",
      categories: [{ category: "", amount: 0 }], // Default categories
      bank_details_verified: false,
    },
  });

  // Effect to reset editForm when request data loads or isEditing changes
  useEffect(() => {
    if (request && isEditing) {
      const defaultSkuPrefix = request.country === 'United Kingdom' ? 'UK' : 'CH';
      editForm.reset({
        supplier_name: request.supplier_name,
        sku_number: request.sku_number || defaultSkuPrefix, // Ensure default for PrefixedInput based on country
        not_sku_related: request.not_sku_related, // Set the checkbox state
        lease_id: request.lease_id || "", // Set lease_id
        supplier_address: request.supplier_address,
        iban_number: request.iban_number || "",
        sort_code: request.sort_code || "",
        account_number: request.account_number || "",
        bank_account_name: request.bank_account_name || "",
        currency: request.currency || "CHF",
        total_amount: request.total_amount || 0.00,
        notes: request.reason_for_payment || "", // CHANGED: Map reason_for_payment to notes
        date_payment_required: request.date_payment_required ? new Date(request.date_payment_required) : undefined,
        invoice_pdf: undefined,
        receipt_required: request.receipt_required,
        is_urgent: request.is_urgent,
        country: request.country, // Ensure form's country field is updated
        categories: request.categories.length > 0 ? request.categories : [{ category: "", amount: 0 }], // Set categories from request
        bank_details_verified: request.bank_details_verified,
      });
    }
  }, [request, isEditing, editForm]);

  // Form for receipt upload (admin)
  const receiptUploadForm = useForm<z.infer<typeof receiptUploadSchema>>({
    resolver: zodResolver(receiptUploadSchema),
    defaultValues: {
      receipt_pdf: undefined,
    },
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
    mutationFn: async (updatedFields: Partial<PaymentRequest> & { new_invoice_files?: FileList }) => {
      if (!id || !user?.id) throw new Error("Request ID or user ID missing.");

      let updatedInvoicePdfUrls = request?.invoice_pdf_urls || [];

      if (updatedFields.new_invoice_files && updatedFields.new_invoice_files.length > 0) {
        const newUploadedUrls: string[] = [];
        for (let i = 0; i < updatedFields.new_invoice_files.length; i++) {
          const file = updatedFields.new_invoice_files[i];
          const fileExtension = file.name.split('.').pop();
          const fileName = `${user.id}/${crypto.randomUUID()}.${fileExtension}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('invoices')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`Failed to upload new invoice ${file.name}: ${uploadError.message}`);
          }

          const { data: publicUrlData } = supabase.storage
            .from('invoices')
            .getPublicUrl(fileName);

          if (!publicUrlData?.publicUrl) {
            throw new Error(`Failed to get public URL for new invoice ${file.name}.`);
          }
          newUploadedUrls.push(publicUrlData.publicUrl);
        }
        updatedInvoicePdfUrls = [...updatedInvoicePdfUrls, ...newUploadedUrls];
      }

      // Explicitly cast categories here before sending to Supabase
      const categoriesPayload = updatedFields.categories ? updatedFields.categories as PaymentRequestCategoryItem[] : undefined;

      let query = supabase
        .from('payment_requests')
        .update({
          ...updatedFields,
          categories: categoriesPayload, // Use the casted payload
          invoice_pdf_urls: updatedInvoicePdfUrls,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      
      // Apply country filter for update
      if (userProfile?.role === 'requester' && userProfile.country) {
        query = query.eq('country', userProfile.country);
      } else if (userProfile?.role === 'admin' && currentCountry !== 'all') {
        // Only apply country filter if a specific country is selected by the admin
        query = query.eq('country', currentCountry);
      }

      // IMPORTANT: Add .select() to the update query to get the affected rows
      const { data, error } = await query.select(); 
      
      if (error) {
        console.error("Supabase update error:", error);
        // Throw a more descriptive error if possible
        throw new Error(`Supabase update failed: ${error.message} (Code: ${error.code}, Hint: ${error.hint})`);
      }
      
      // Log the data returned by Supabase
      console.log("Supabase update data:", data);
      
      if (!data || data.length === 0) {
        // If no data is returned, it means no rows were updated, likely due to RLS
        console.warn("Supabase update returned no data. This might be due to RLS preventing the update.");
        throw new Error("Update failed: No matching record found or insufficient permissions (RLS).");
      }

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentRequest', id] });
      queryClient.invalidateQueries({ queryKey: ['paymentRequestAudits', id] });
      queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] }); // Invalidate dashboard table
      queryClient.invalidateQueries({ queryKey: ['allPaymentRequestsForSummary'] }); // Invalidate summary cards
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
    const toastId = showLoading("Updating payment request...");
    try {
      if (!user?.id) {
        throw new Error("User not authenticated.");
      }

      const invoiceFiles: FileList = values.invoice_pdf; // This is the new files, not existing ones
      
      const updatedFields: Partial<PaymentRequest> & { new_invoice_files?: FileList } = {
        supplier_name: values.supplier_name,
        sku_number: values.not_sku_related ? null : values.sku_number, // Set to null if not SKU related
        not_sku_related: values.not_sku_related, // Save the checkbox state
        lease_id: values.lease_id || null, // Include lease_id, set to null if empty
        supplier_address: values.supplier_address,
        currency: values.currency,
        total_amount: values.total_amount,
        reason_for_payment: values.notes || null, // CHANGED: Map notes to reason_for_payment, set to null if optional/empty
        date_payment_required: values.date_payment_required.toISOString().split('T')[0],
        receipt_required: values.receipt_required,
        is_urgent: values.is_urgent, // Include urgent status
        country: values.country, // Include country from form values
        categories: values.categories as PaymentRequestCategoryItem[], // Explicitly cast here
        bank_details_verified: values.bank_details_verified,
      };

      // Conditionally add bank details to updatedFields
      if (values.country === 'United Kingdom') {
        updatedFields.iban_number = null;
        updatedFields.sort_code = values.sort_code;
        updatedFields.account_number = values.account_number?.replace(/\s/g, ''); // Remove spaces for DB storage
        updatedFields.bank_account_name = values.bank_account_name;
      } else {
        updatedFields.iban_number = values.iban_number;
        updatedFields.sort_code = null;
        updatedFields.account_number = null;
        updatedFields.bank_account_name = values.country === 'Switzerland' ? values.bank_account_name : null;
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

  const handleAdminAction = async (status: 'setup_awaiting_approval' | 'approved' | 'declined' | 'queried' | 'reverted_to_pending', reason?: string) => {
    const toastId = showLoading(`Setting status to ${status.replace(/_/g, ' ')}...`);
    try {
      if (!user?.id) throw new Error("Admin user not authenticated.");

      // If declining, first add the reason as a comment
      if (status === 'declined' && reason) {
        await addCommentMutation.mutateAsync(`Declined: ${reason}`);
      }

      const updatedFields: Partial<PaymentRequest> = {
        status: status === 'reverted_to_pending' ? 'pending' : status,
        admin_action_by: user.id,
        admin_action_reason: reason || null,
        updated_at: new Date().toISOString(),
        is_reminded: false, // Reset reminder status on any admin action
        last_reminder_sent_at: null, // Reset reminder timestamp
      };

      if (status === 'setup_awaiting_approval') {
        updatedFields.payment_setup_date = new Date().toISOString();
      } else if (status === 'approved') {
        updatedFields.payment_approved_date = new Date().toISOString();
      } else if (status === 'reverted_to_pending') {
        updatedFields.payment_setup_date = null;
        updatedFields.payment_approved_date = null;
      }

      await updateRequestMutation.mutateAsync(updatedFields);
      dismissToast(toastId);
      return true;
    } catch (error: any) {
      dismissToast(toastId);
      console.error("Error in handleAdminAction:", error);
      showError(error.message || `Failed to set status to ${status.replace(/_/g, ' ')}.`);
      throw error;
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
      queryClient.invalidateQueries({ queryKey: ['paymentRequestsForTable'] }); // Invalidate dashboard table
      queryClient.invalidateQueries({ queryKey: ['allPaymentRequestsForSummary'] }); // Invalidate summary cards
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

      await updateRequestMutation.mutateAsync({ receipt_pdf_url: publicUrlData.publicUrl });
      dismissToast(toastId);
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to upload receipt.");
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
  const canAmend = (request.status === 'pending' || request.status === 'queried');
  const isAdmin = userRole === 'admin';
  const isRequester = user?.id === request.requester_id;

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Payment Request #{request.id.substring(0, 8)}</h1>
        {canAmend && !isEditing && (
          <Button onClick={() => setIsEditing(true)} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground shadow-sm">
            Amend Request
          </Button>
        )}
        {isEditing && (
          <div className="space-x-2">
            <Button variant="outline" onClick={() => { setIsEditing(false); editForm.reset(); }} className="shadow-sm">
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
          request={request}
          editForm={editForm}
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
        isRequester={isRequester}
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