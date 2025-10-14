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
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry
import { categoryOptions } from '@/lib/constants'; // Import categoryOptions

import { Button } from '@/components/ui/button';
import PaymentRequestDetailsCard from '@/components/payment-requests/PaymentRequestDetailsCard';
import AdminActionsCard from '@/components/payment-requests/AdminActionsCard';
import AdminReceiptUploadCard from '@/components/payment-requests/AdminReceiptUploadCard';
import PaymentRequestAuditTrailCard from '@/components/payment-requests/PaymentRequestAuditTrailCard';
import PaymentRequestCommentsCard from '@/components/payment-requests/PaymentRequestCommentsCard';
import { Card } from '@/components/ui/card'; // Import Card

// List of major currencies, expanded and sorted alphabetically
const majorCurrencies = [
  { value: 'ALL', label: 'ALL - Albanian Lek' },
  { value: 'AMD', label: 'AMD - Armenian Dram' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'AZN', label: 'AZN - Azerbaijani Manat' },
  { value: 'BAM', label: 'BAM - Bosnia and Herzegovina Convertible Mark' },
  { value: 'BGN', label: 'BGN - Bulgarian Lev' },
  { value: 'BYN', label: 'BYN - Belarusian Ruble' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'CHF', label: 'CHF - Swiss Franc' },
  { value: 'CNY', label: 'CNY - Chinese Yuan' },
  { value: 'CZK', label: 'CZK - Czech Koruna' },
  { value: 'DKK', label: 'DKK - Danish Krone' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'GEL', label: 'GEL - Georgian Lari' },
  { value: 'HKD', label: 'HKD - Hong Kong Dollar' },
  { value: 'HUF', label: 'HUF - Hungarian Forint' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'ISK', label: 'ISK - Icelandic Króna' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
  { value: 'MKD', label: 'MKD - Macedonian Denar' },
  { value: 'MDL', label: 'MDL - Moldovan Leu' },
  { value: 'MXN', label: 'MXN - Mexican Peso' },
  { value: 'NOK', label: 'NOK - Norwegian Krone' },
  { value: 'NZD', label: 'NZD - New Zealand Dollar' },
  { value: 'PLN', label: 'PLN - Polish Zloty' },
  { value: 'RON', label: 'RON - Romanian Leu' },
  { value: 'RSD', label: 'RSD - Serbian Dinar' },
  { value: 'SEK', label: 'SEK - Swedish Krona' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'TRY', label: 'TRY - Turkish Lira' },
  { value: 'UAH', label: 'UAH - Ukrainian Hryvnia' },
  { value: 'USD', label: 'USD - United States Dollar' },
  { value: 'ZAR', label: 'ZAR - South African Rand' },
].sort((a, b) => a.label.localeCompare(b.label));

// Zod schema for editing payment requests (requester)
const editFormSchema = z.object({
  supplier_name: z.string().min(1, "Supplier Name is required"),
  sku_number: z.string().optional(), // Make optional initially, then refine
  not_sku_related: z.boolean().default(false), // New field
  lease_id: z.string().optional().refine((val) => { // New field
    if (val === undefined || val === null || val.trim() === '') return true; // Optional, so empty is fine
    return /^\d+$/.test(val); // Must be numerical if present
  }, "Lease ID must be a numerical value."),
  supplier_address: z.string().min(1, "Supplier Address is required"),
  iban_number: z.string().optional(), // Made optional
  sort_code: z.string().optional(), // New field
  account_number: z.string().optional(), // New field
  bank_account_name: z.string().optional(), // New field
  currency: z.string().min(1, "Currency is required"),
  payment_amount: z.coerce.number().min(0.01, "Payment Amount must be positive"),
  reason_for_payment: z.string().min(1, "Reason for Payment is required"),
  date_payment_required: z.date({
    required_error: "Date Payment Required is required",
  }),
  invoice_pdf: z.any()
    .optional() // Make optional for editing, only required if a new file is selected
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024), "Max file size is 5MB per file.") // 5MB limit per file
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.type === "application/pdf"), "Only .pdf files are accepted."),
  receipt_required: z.boolean().default(false),
  is_urgent: z.boolean().default(false), // New field
  country: z.string().min(1, "Country is required"), // ADDED: country field to schema
  category: z.string().min(1, "Category is required"), // ADDED: category field to schema
}).superRefine((data, ctx) => {
  // Determine SKU prefix based on the request's country
  const skuPrefix = data.country === 'United Kingdom' ? 'UK' : 'CH';

  if (!data.not_sku_related) {
    if (!data.sku_number || data.sku_number.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU Number is required unless 'Not SKU Related' is checked.`,
        path: ['sku_number'],
      });
    } else if (!data.sku_number.startsWith(skuPrefix)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU Number must start with '${skuPrefix}'.`,
        path: ['sku_number'],
      });
    } else if (!new RegExp(`^${skuPrefix}\\d+$`).test(data.sku_number)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU Number must be '${skuPrefix}' followed by numbers.`,
        path: ['sku_number'],
      });
    }
  }

  // Conditional validation for bank details based on country
  if (data.country === 'United Kingdom') {
    if (!data.sort_code || !/^\d{2}-\d{2}-\d{2}$/.test(data.sort_code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sort Code is required and must be in XX-XX-XX format.",
        path: ['sort_code'],
      });
    }
    if (!data.account_number || !/^\d{8}$/.test(data.account_number.replace(/\s/g, ''))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Account Number is required and must be 8 digits.",
        path: ['account_number'],
      });
    }
    if (!data.bank_account_name || data.bank_account_name.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank Account Name is required.",
        path: ['bank_account_name'],
      });
    }
    // Ensure IBAN is not provided for UK
    if (data.iban_number && data.iban_number.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN Number should not be provided for United Kingdom.",
        path: ['iban_number'],
      });
    }
  } else {
    if (!data.iban_number || data.iban_number.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN Number is required.",
        path: ['iban_number'],
      });
    }
    // Ensure UK bank details are not provided for non-UK countries
    if (data.sort_code && data.sort_code.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sort Code should not be provided for this country.",
        path: ['sort_code'],
      });
    }
    if (data.account_number && data.account_number.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Account Number should not be provided for this country.",
        path: ['account_number'],
      });
    }
    if (data.bank_account_name && data.bank_account_name.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank Account Name should not be provided for this country.",
        path: ['bank_account_name'],
      });
    }
  }
});

// Zod schema for admin query note
const queryFormSchema = z.object({
  query_note: z.string().min(1, "Query note is required"),
});

// Zod schema for admin receipt upload
const receiptUploadSchema = z.object({
  receipt_pdf: z.any()
    .refine((file) => file?.length > 0, "Receipt PDF is required.")
    .refine((file) => file?.[0]?.size <= 5 * 1024 * 1024, "Max file size is 5MB.")
    .refine((file) => file?.[0]?.type === "application/pdf", "Only .pdf files are accepted."),
});

// Zod schema for admin revert reason
const revertFormSchema = z.object({
  revert_reason: z.string().min(1, "Revert reason is required"),
});


const PaymentRequestDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading, user, userProfile } = useSession();
  const { currentCountry, isCountryLocked, availableCountries } = useCountry(); // Get isCountryLocked and availableCountries
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const userRole = userProfile?.role || null;

  // Fetch payment request details
  const { data: request, isLoading: isRequestLoading, error: requestError } = useQuery<PaymentRequest | null>({
    queryKey: ['paymentRequest', id, currentCountry], // Add currentCountry to queryKey
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
    queryKey: ['paymentRequestAudits', id, currentCountry], // Add currentCountry to queryKey
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
    queryKey: ['auditUsers', currentCountry], // Add currentCountry to queryKey
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
    enabled: !!session, // Changed enabled condition
  });

  // Form for editing (requester/admin)
  const editForm = useForm<z.infer<typeof editFormSchema>>({
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
      payment_amount: 0.00,
      reason_for_payment: "",
      date_payment_required: undefined,
      invoice_pdf: undefined,
      receipt_required: false,
      is_urgent: false, // Default to not urgent
      country: request?.country || "Switzerland", // ADDED: Set default country from request
      category: "", // ADDED: Default category
    },
    // REMOVED: context property as country is now a form field
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
        currency: request.currency,
        payment_amount: request.payment_amount,
        reason_for_payment: request.reason_for_payment,
        date_payment_required: request.date_payment_required ? new Date(request.date_payment_required) : undefined,
        invoice_pdf: undefined,
        receipt_required: request.receipt_required,
        is_urgent: request.is_urgent,
        country: request.country, // Ensure form's country field is updated
        category: request.category || "", // ADDED: Set category from request
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

      let query = supabase
        .from('payment_requests')
        .update({
          ...updatedFields,
          invoice_pdf_urls: updatedInvoicePdfUrls,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      
      // Apply country filter for update
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

  const handleRequesterEditSubmit = async (values: z.infer<typeof editFormSchema>) => {
    const toastId = showLoading("Updating payment request...");
    try {
      const updatedFields: Partial<PaymentRequest> & { new_invoice_files?: FileList } = {
        supplier_name: values.supplier_name,
        sku_number: values.not_sku_related ? null : values.sku_number, // Set to null if not SKU related
        not_sku_related: values.not_sku_related, // Save the checkbox state
        lease_id: values.lease_id || null, // Include lease_id, set to null if empty
        supplier_address: values.supplier_address,
        currency: values.currency,
        payment_amount: values.payment_amount,
        reason_for_payment: values.reason_for_payment,
        date_payment_required: values.date_payment_required.toISOString().split('T')[0],
        receipt_required: values.receipt_required,
        is_urgent: values.is_urgent, // Include urgent status
        country: values.country, // Include country from form values
        category: values.category, // ADDED: category to updated fields
      };

      // Conditionally add bank details to updatedFields
      if (values.country === 'United Kingdom') {
        updatedFields.iban_number = null;
        updatedFields.sort_code = values.sort_code;
        updatedFields.account_number = values.account_number?.replace(/\s/g, '');
        updatedFields.bank_account_name = values.bank_account_name;
      } else {
        updatedFields.iban_number = values.iban_number;
        updatedFields.sort_code = null;
        updatedFields.account_number = null;
        updatedFields.bank_account_name = null;
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
  const isRequester = user?.id === request.requester_id; // Still useful for comment box logic

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
              disabled={updateRequestMutation.isPending} // Disable button when mutation is pending
            >
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
        handleAdminRevert={handleAdminRevert}
        handleSendReminder={handleSendReminder}
        isSendingReminder={sendReminderMutation.isPending}
        user={user}
      />

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