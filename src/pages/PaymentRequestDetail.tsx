"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PaymentRequest, Profile, PaymentRequestAudit } from '@/types/supabase';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import PaymentRequestDetailsCard from '@/components/payment-requests/PaymentRequestDetailsCard';
import AdminActionsCard from '@/components/payment-requests/AdminActionsCard';
import AdminReceiptUploadCard from '@/components/payment-requests/AdminReceiptUploadCard';
import PaymentRequestAuditTrailCard from '@/components/payment-requests/PaymentRequestAuditTrailCard';

// Zod schema for editing payment requests (requester) - kept here for editForm initialization
const editFormSchema = z.object({
  supplier_name: z.string().min(1, "Supplier Name is required"),
  sku_number: z.string().regex(/^CH\d+$/, "SKU Number must start with 'CH' and be followed by numbers."),
  supplier_address: z.string().min(1, "Supplier Address is required"),
  iban_number: z.string().min(1, "IBAN Number is required"),
  currency: z.string().min(1, "Currency is required"),
  payment_amount: z.coerce.number().min(0.01, "Payment Amount must be positive"),
  reason_for_payment: z.string().min(1, "Reason for Payment is required"),
  date_payment_required: z.date({
    required_error: "Date Payment Required is required",
  }),
  invoice_pdf: z.any()
    .optional()
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024), "Max file size is 5MB per file.")
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.type === "application/pdf"), "Only .pdf files are accepted."),
  receipt_required: z.boolean().default(false),
});

// Zod schema for admin query note - kept here for handleAdminQuery
const queryFormSchema = z.object({
  query_note: z.string().min(1, "Query note is required"),
});

// Zod schema for admin receipt upload - kept here for handleReceiptUpload
const receiptUploadSchema = z.object({
  receipt_pdf: z.any()
    .refine((file) => file?.length > 0, "Receipt PDF is required.")
    .refine((file) => file?.[0]?.size <= 5 * 1024 * 1024, "Max file size is 5MB.")
    .refine((file) => file?.[0]?.type === "application/pdf", "Only .pdf files are accepted."),
});


const PaymentRequestDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading, user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userRole, setUserRole] = useState<Profile['role'] | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Fetch user role
  const { data: profileData, isLoading: isProfileLoading } = useQuery<Profile | null>({
    queryKey: ['userProfile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (profileData) {
      setUserRole(profileData.role);
    }
  }, [profileData]);

  // Fetch payment request details
  const { data: request, isLoading: isRequestLoading, error: requestError } = useQuery<PaymentRequest | null>({
    queryKey: ['paymentRequest', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch audit trail
  const { data: audits, isLoading: isAuditsLoading, error: auditsError } = useQuery<PaymentRequestAudit[]>({
    queryKey: ['paymentRequestAudits', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('payment_request_audits')
        .select('*')
        .eq('payment_request_id', id)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch user names and emails for audit trail
  const { data: auditUsers, isLoading: isAuditUsersLoading } = useQuery<Record<string, string>>({
    queryKey: ['auditUsers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_with_email')
        .select('id, first_name, last_name, user_email');
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
    enabled: !!audits && audits.length > 0,
  });

  // Form for editing (requester/admin)
  const editForm = useForm<z.infer<typeof editFormSchema>>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      supplier_name: "",
      sku_number: "CH",
      supplier_address: "",
      iban_number: "",
      currency: "USD",
      payment_amount: 0.00,
      reason_for_payment: "",
      date_payment_required: undefined,
      invoice_pdf: undefined,
      receipt_required: false,
    },
  });

  // Effect to reset editForm when request data loads or isEditing changes
  useEffect(() => {
    if (request && isEditing) {
      editForm.reset({
        supplier_name: request.supplier_name,
        sku_number: request.sku_number,
        supplier_address: request.supplier_address,
        iban_number: request.iban_number,
        currency: request.currency,
        payment_amount: request.payment_amount,
        reason_for_payment: request.reason_for_payment,
        date_payment_required: request.date_payment_required ? new Date(request.date_payment_required) : undefined,
        invoice_pdf: undefined,
        receipt_required: request.receipt_required,
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

      const { error } = await supabase
        .from('payment_requests')
        .update({
          ...updatedFields,
          invoice_pdf_urls: updatedInvoicePdfUrls,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentRequest', id] });
      queryClient.invalidateQueries({ queryKey: ['paymentRequestAudits', id] });
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
      const { error } = await supabase
        .from('payment_requests')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentRequests'] });
      showSuccess("Payment request deleted successfully!");
      navigate('/admin/requests');
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete payment request.");
      console.error("Delete error:", error);
    },
  });

  const handleRequesterEditSubmit = async (values: z.infer<typeof editFormSchema>) => {
    const toastId = showLoading("Updating payment request...");
    try {
      const updatedFields: Partial<PaymentRequest> & { new_invoice_files?: FileList } = {
        supplier_name: values.supplier_name,
        sku_number: values.sku_number,
        supplier_address: values.supplier_address,
        iban_number: values.iban_number,
        currency: values.currency,
        payment_amount: values.payment_amount,
        reason_for_payment: values.reason_for_payment,
        date_payment_required: values.date_payment_required.toISOString().split('T')[0],
        receipt_required: values.receipt_required,
      };

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

  const handleAdminAction = async (status: 'setup_awaiting_approval' | 'approved' | 'declined' | 'queried', reason?: string) => {
    const toastId = showLoading(`Setting status to ${status.replace(/_/g, ' ')}...`);
    try {
      if (!user?.id) throw new Error("Admin user not authenticated.");

      const updatedFields: Partial<PaymentRequest> = {
        status: status,
        admin_action_by: user.id,
        admin_action_reason: reason || null,
        updated_at: new Date().toISOString(),
      };

      if (status === 'setup_awaiting_approval') {
        updatedFields.payment_setup_date = new Date().toISOString();
      } else if (status === 'approved') {
        updatedFields.payment_approved_date = new Date().toISOString();
      }

      await updateRequestMutation.mutateAsync(updatedFields);
      dismissToast(toastId);
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || `Failed to set status to ${status.replace(/_/g, ' ')}.`);
    }
  };

  const handleAdminQuery = async (values: z.infer<typeof queryFormSchema>) => {
    const toastId = showLoading("Adding query note and updating status...");
    try {
      if (!id || !user?.id) throw new Error("Request ID or user ID missing.");

      const { error: auditError } = await supabase
        .from('payment_request_audits')
        .insert({
          payment_request_id: id,
          changed_by_user_id: user.id,
          change_description: `Admin queried payment: ${values.query_note}`,
        });

      if (auditError) throw new Error(`Failed to log query in audit trail: ${auditError.message}`);

      await handleAdminAction('queried', values.query_note);
      dismissToast(toastId);
      showSuccess("Payment queried successfully!");
      // queryForm.reset() is handled within AdminActionsCard
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to query payment.");
      console.error("Query payment error:", error);
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
      // receiptUploadForm.reset() is handled within AdminReceiptUploadCard
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to upload receipt.");
    }
  };

  if (isLoading || isProfileLoading || isRequestLoading || isAuditsLoading || isAuditUsersLoading) {
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

  const isRequester = userRole === 'requester' && user?.id === request.requester_id;
  const isAdmin = userRole === 'admin';

  const canAmend = (request.status === 'pending' || request.status === 'queried') && (isRequester || isAdmin);

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Payment Request #{request.id.substring(0, 8)}</h1>
        {canAmend && !isEditing && (
          <Button onClick={() => setIsEditing(true)} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground">
            Amend Request
          </Button>
        )}
        {isEditing && (
          <div className="space-x-2">
            <Button variant="outline" onClick={() => { setIsEditing(false); editForm.reset(); }}>
              Cancel
            </Button>
            <Button form="edit-request-form" type="submit" className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground">
              Save Changes
            </Button>
          </div>
        )}
      </div>

      <PaymentRequestDetailsCard
        request={request}
        isEditing={isEditing}
        canAmend={canAmend}
        setIsEditing={setIsEditing}
        editForm={editForm}
        handleRequesterEditSubmit={handleRequesterEditSubmit}
        auditUsers={auditUsers}
      />

      <AdminActionsCard
        request={request}
        isAdmin={isAdmin}
        updateRequestMutation={updateRequestMutation}
        deleteRequestMutation={deleteRequestMutation}
        handleAdminAction={handleAdminAction}
        handleAdminQuery={handleAdminQuery}
        user={user}
      />

      <AdminReceiptUploadCard
        request={request}
        isAdmin={isAdmin}
        updateRequestMutation={updateRequestMutation}
        handleReceiptUpload={handleReceiptUpload}
      />

      <PaymentRequestAuditTrailCard
        audits={audits}
        auditUsers={auditUsers}
      />
    </div>
  );
};

export default PaymentRequestDetail;