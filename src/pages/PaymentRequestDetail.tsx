"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PaymentRequest, Profile, PaymentRequestAudit } from '@/types/supabase';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import DatePicker from '@/components/DatePicker';
import { Separator } from '@/components/ui/separator';
import { FileText, Download, CheckCircle, XCircle, DollarSign, History, MessageSquare, Trash2 } from 'lucide-react';
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

// Zod schema for editing payment requests (requester)
const editFormSchema = z.object({
  supplier_name: z.string().min(1, "Supplier Name is required"),
  sku_number: z.string().min(1, "SKU Number is required"),
  supplier_address: z.string().min(1, "Supplier Address is required"),
  iban_number: z.string().min(1, "IBAN Number is required"),
  reason_for_payment: z.string().min(1, "Reason for Payment is required"),
  date_payment_required: z.date({
    required_error: "Date Payment Required is required",
  }),
  invoice_pdf: z.any().optional(), // Optional for edit, as it might not change
});

// Zod schema for admin decline reason
const declineFormSchema = z.object({
  admin_action_reason: z.string().min(1, "Decline reason is required"),
});

// Zod schema for admin query note
const queryFormSchema = z.object({
  query_note: z.string().min(1, "Query note is required"),
});

// Zod schema for admin receipt upload
const receiptUploadSchema = z.object({
  receipt_pdf: z.any()
    .refine((file) => file?.length > 0, "Receipt PDF is required.")
    .refine((file) => file?.[0]?.size <= 5 * 1024 * 1024, "Max file size is 5MB.") // 5MB limit
    .refine((file) => file?.[0]?.type === "application/pdf", "Only .pdf files are accepted."),
});

const PaymentRequestDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading, user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userRole, setUserRole] = useState<Profile['role'] | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // // Fetch user role
  // const { data: profileData, isLoading: isProfileLoading } = useQuery<Profile | null>({
  //   queryKey: ['userProfile', user?.id],
  //   queryFn: async () => {
  //     if (!user?.id) return null;
  //     const { data, error } = await supabase
  //       .from('profiles')
  //       .select('role')
  //       .eq('id', user.id)
  //       .single();
  //     if (error) throw error;
  //     return data;
  //   },
  //   enabled: !!user?.id,
  // });

  // useEffect(() => {
  //   if (profileData) {
  //     setUserRole(profileData.role);
  //   }
  // }, [profileData]);

  // // Fetch payment request details
  // const { data: request, isLoading: isRequestLoading, error: requestError } = useQuery<PaymentRequest | null>({
  //   queryKey: ['paymentRequest', id],
  //   queryFn: async () => {
  //     if (!id) return null;
  //     const { data, error } = await supabase
  //       .from('payment_requests')
  //       .select('*')
  //       .eq('id', id)
  //       .single();
  //     if (error) throw error;
  //     return data;
  //   },
  //   enabled: !!id,
  // });

  // // Fetch audit trail
  // const { data: audits, isLoading: isAuditsLoading, error: auditsError } = useQuery<PaymentRequestAudit[]>({
  //   queryKey: ['paymentRequestAudits', id],
  //   queryFn: async () => {
  //     if (!id) return [];
  //     const { data, error } = await supabase
  //       .from('payment_request_audits')
  //       .select('*')
  //       .eq('payment_request_id', id)
  //       .order('changed_at', { ascending: false });
  //     if (error) throw error;
  //     return data;
  //   },
  //   enabled: !!id,
  // });

  // // Fetch user names and emails for audit trail
  // const { data: auditUsers, isLoading: isAuditUsersLoading } = useQuery<Record<string, string>>({
  //   queryKey: ['auditUsers'],
  //   queryFn: async () => {
  //     // Use the profile_with_email view to get user details including email
  //     const { data, error } = await supabase
  //       .from('profile_with_email')
  //       .select('id, first_name, last_name, user_email');
  //     if (error) throw error;
  //     const usersMap: Record<string, string> = {};
  //     data.forEach(profile => {
  //       let displayString = profile.user_email || profile.id; // Default to email or ID
  //       if (profile.first_name || profile.last_name) {
  //         const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  //         if (profile.user_email) {
  //           displayString = `${name} (${profile.user_email})`;
  //         } else {
  //           displayString = name;
  //         }
  //       }
  //       usersMap[profile.id] = displayString;
  //     });
  //     return usersMap;
  //   },
  //   enabled: !!audits && audits.length > 0,
  // });

  // // Form for editing (requester/admin)
  // const editForm = useForm<z.infer<typeof editFormSchema>>({
  //   resolver: zodResolver(editFormSchema),
  //   defaultValues: {
  //     supplier_name: "",
  //     sku_number: "",
  //     supplier_address: "",
  //     iban_number: "",
  //     reason_for_payment: "",
  //     date_payment_required: undefined,
  //     invoice_pdf: undefined,
  //   },
  // });

  // // Effect to reset editForm when request data loads or isEditing changes
  // useEffect(() => {
  //   if (request && isEditing) {
  //     editForm.reset({
  //       supplier_name: request.supplier_name,
  //       sku_number: request.sku_number,
  //       supplier_address: request.supplier_address,
  //       iban_number: request.iban_number,
  //       reason_for_payment: request.reason_for_payment,
  //       date_payment_required: request.date_payment_required ? new Date(request.date_payment_required) : undefined,
  //       invoice_pdf: undefined, // Always reset file input
  //     });
  //   } 
  // }, [request, isEditing, editForm]);


  // // Form for declining (admin)
  // const declineForm = useForm<z.infer<typeof declineFormSchema>>({
  //   resolver: zodResolver(declineFormSchema),
  //   defaultValues: {
  //     admin_action_reason: "",
  //   },
  // });

  // // Form for querying (admin)
  // const queryForm = useForm<z.infer<typeof queryFormSchema>>({
  //   resolver: zodResolver(queryFormSchema),
  //   defaultValues: {
  //     query_note: "",
  //   },
  // });

  // // Form for receipt upload (admin)
  // const receiptUploadForm = useForm<z.infer<typeof receiptUploadSchema>>({
  //   resolver: zodResolver(receiptUploadSchema),
  //   defaultValues: {
  //     receipt_pdf: undefined,
  //   },
  // });

  // const updateRequestMutation = useMutation({
  //   mutationFn: async (updatedFields: Partial<PaymentRequest> & { invoice_file?: File }) => {
  //     if (!id || !user?.id) throw new Error("Request ID or user ID missing.");

  //     let invoicePdfUrl = updatedFields.invoice_pdf_url;
  //     if (updatedFields.invoice_file) {
  //       const invoiceFile = updatedFields.invoice_file;
  //       const fileExtension = invoiceFile.name.split('.').pop();
  //       const fileName = `${user.id}/${crypto.randomUUID()}.${fileExtension}`;

  //       const { data: uploadData, error: uploadError } = await supabase.storage
  //         .from('invoices')
  //         .upload(fileName, invoiceFile, {
  //           cacheControl: '3600',
  //           upsert: false,
  //         });

  //       if (uploadError) {
  //         throw new Error(`Failed to upload new invoice: ${uploadError.message}`);
  //       }

  //       const { data: publicUrlData } = supabase.storage
  //         .from('invoices')
  //         .getPublicUrl(fileName);

  //       if (!publicUrlData?.publicUrl) {
  //         throw new Error("Failed to get public URL for new invoice.");
  //       }
  //       invoicePdfUrl = publicUrlData.publicUrl;
  //     }

  //     const { error } = await supabase
  //       .from('payment_requests')
  //       .update({
  //         ...updatedFields,
  //         invoice_pdf_url: invoicePdfUrl,
  //         updated_at: new Date().toISOString(),
  //       })
  //       .eq('id', id);

  //     if (error) throw error;
  //     return true;
  //   },
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ['paymentRequest', id] });
  //     queryClient.invalidateQueries({ queryKey: ['paymentRequestAudits', id] });
  //     showSuccess("Payment request updated successfully!");
  //     setIsEditing(false);
  //   },
  //   onError: (error: any) => {
  //     showError(error.message || "Failed to update payment request.");
  //     console.error("Update error:", error);
  //   },
  // });

  // const deleteRequestMutation = useMutation({
  //   mutationFn: async () => {
  //     if (!id) throw new Error("Request ID missing.");
  //     const { error } = await supabase
  //       .from('payment_requests')
  //       .delete()
  //       .eq('id', id);
  //     if (error) throw error;
  //     return true;
  //   },
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ['paymentRequests'] }); // Invalidate all requests list
  //     showSuccess("Payment request deleted successfully!");
  //     navigate('/admin/requests'); // Redirect to admin requests list
  //   },
  //   onError: (error: any) => {
  //     showError(error.message || "Failed to delete payment request.");
  //     console.error("Delete error:", error);
  //   },
  // });

  // const handleRequesterEditSubmit = async (values: z.infer<typeof editFormSchema>) => {
  //   const toastId = showLoading("Updating payment request...");
  //   try {
  //     const updatedFields: Partial<PaymentRequest> & { invoice_file?: File } = {
  //       supplier_name: values.supplier_name,
  //       sku_number: values.sku_number,
  //       supplier_address: values.supplier_address,
  //       iban_number: values.iban_number,
  //       reason_for_payment: values.reason_for_payment,
  //       date_payment_required: values.date_payment_required.toISOString().split('T')[0],
  //     };

  //     if (values.invoice_pdf && values.invoice_pdf.length > 0) {
  //       updatedFields.invoice_file = values.invoice_pdf[0];
  //     }

  //     await updateRequestMutation.mutateAsync(updatedFields);
  //     dismissToast(toastId);
  //   } catch (error: any) {
  //     dismissToast(toastId);
  //     showError(error.message || "An unexpected error occurred during update.");
  //   }
  // };

  // const handleAdminAction = async (status: 'setup_awaiting_approval' | 'approved' | 'declined' | 'queried', reason?: string) => {
  //   const toastId = showLoading(`Setting status to ${status.replace(/_/g, ' ')}...`);
  //   try {
  //     if (!user?.id) throw new Error("Admin user not authenticated.");

  //     const updatedFields: Partial<PaymentRequest> = {
  //       status: status,
  //       admin_action_by: user.id,
  //       admin_action_reason: reason || null,
  //       updated_at: new Date().toISOString(),
  //     };

  //     if (status === 'setup_awaiting_approval') {
  //       updatedFields.payment_setup_date = new Date().toISOString();
  //     } else if (status === 'approved') {
  //       updatedFields.payment_approved_date = new Date().toISOString();
  //     }

  //     await updateRequestMutation.mutateAsync(updatedFields);
  //     dismissToast(toastId);
  //   } catch (error: any) {
  //     dismissToast(toastId);
  //     showError(error.message || `Failed to set status to ${status.replace(/_/g, ' ')}.`);
  //   }
  // };

  // const handleAdminQuery = async (values: z.infer<typeof queryFormSchema>) => {
  //   const toastId = showLoading("Adding query note and updating status...");
  //   try {
  //     if (!id || !user?.id) throw new Error("Request ID or user ID missing.");

  //     // First, log the query in the audit trail
  //     const { error: auditError } = await supabase
  //       .from('payment_request_audits')
  //       .insert({
  //         payment_request_id: id,
  //         changed_by_user_id: user.id,
  //         change_description: `Admin queried payment: ${values.query_note}`,
  //       });

  //     if (auditError) throw new Error(`Failed to log query in audit trail: ${auditError.message}`);

  //     // Then, update the payment request status to 'queried'
  //     await handleAdminAction('queried', values.query_note); // Use the existing admin action handler
  //     dismissToast(toastId);
  //     showSuccess("Payment queried successfully!");
  //     queryForm.reset(); // Clear the form
  //   } catch (error: any) {
  //     dismissToast(toastId);
  //     showError(error.message || "Failed to query payment.");
  //     console.error("Query payment error:", error);
  //   }
  // };

  // const handleReceiptUpload = async (values: z.infer<typeof receiptUploadSchema>) => {
  //   const toastId = showLoading("Uploading receipt...");
  //   try {
  //     if (!user?.id || !id) throw new Error("User or request ID missing.");

  //     const receiptFile = values.receipt_pdf[0];
  //     const fileExtension = receiptFile.name.split('.').pop();
  //     const fileName = `${id}/${crypto.randomUUID()}.${fileExtension}`; // Store receipts by request ID

  //     const { data: uploadData, error: uploadError } = await supabase.storage
  //       .from('receipts')
  //       .upload(fileName, receiptFile, {
  //         cacheControl: '3600',
  //         upsert: false,
  //       });

  //     if (uploadError) {
  //       throw new Error(`Failed to upload receipt: ${uploadError.message}`);
  //     }

  //     const { data: publicUrlData } = supabase.storage
  //       .from('receipts')
  //       .getPublicUrl(fileName);

  //     if (!publicUrlData?.publicUrl) {
  //       throw new Error("Failed to get public URL for receipt.");
  //     }

  //     await updateRequestMutation.mutateAsync({ receipt_pdf_url: publicUrlData.publicUrl });
  //     dismissToast(toastId);
  //     receiptUploadForm.reset();
  //   } catch (error: any) {
  //     dismissToast(toastId);
  //     showError(error.message || "Failed to upload receipt.");
  //   }
  // };

  // if (isLoading || isProfileLoading || isRequestLoading || isAuditsLoading || isAuditUsersLoading) {
  //   return <div className="flex items-center justify-center h-full text-lg">Loading payment request...</div>;
  // }

  // if (!session) {
  //   navigate('/login');
  //   return null;
  // }

  // if (requestError) {
  //   return <div className="flex items-center justify-center h-full text-red-500">Error loading request: {requestError.message}</div>;
  // }

  // if (!request) {
  //   return <div className="flex items-center justify-center h-full text-muted-foreground">Payment request not found.</div>;
  // }

  // const isRequester = userRole === 'requester' && user?.id === request.requester_id;
  // const isAdmin = userRole === 'admin';
  
  // // Allow requester to amend if pending or queried, allow admin to amend any time
  // const canAmend = (isRequester && (request.status === 'pending' || request.status === 'queried')) || isAdmin;

  // const getStatusDisplay = (status: PaymentRequest['status']) => {
  //   switch (status) {
  //     case 'pending':
  //       return 'Pending';
  //     case 'setup_awaiting_approval':
  //       return 'Payment Setup';
  //     case 'approved':
  //       return 'Payment Complete';
  //     case 'declined':
  //       return 'Declined';
  //     case 'queried':
  //       return 'Queried';
  //     default:
  //       return status;
  //   }
  // };

  return (
    <div className="container mx-auto py-8">
      <p>Payment Request Detail (Diagnostic Mode)</p>
    </div>
  );
};

export default PaymentRequestDetail;