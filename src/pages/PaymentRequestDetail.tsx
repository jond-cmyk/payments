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
import { FileText, Download, CheckCircle, XCircle, DollarSign, History, MessageSquare } from 'lucide-react';
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
      // Use the profile_with_email view to get user details including email
      const { data, error } = await supabase
        .from('profile_with_email')
        .select('id, first_name, last_name, user_email');
      if (error) throw error;
      const usersMap: Record<string, string> = {};
      data.forEach(profile => {
        let displayString = profile.user_email || profile.id; // Default to email or ID
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

  // Form for editing (requester)
  const editForm = useForm<z.infer<typeof editFormSchema>>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      supplier_name: request?.supplier_name || "",
      sku_number: request?.sku_number || "",
      supplier_address: request?.supplier_address || "",
      iban_number: request?.iban_number || "",
      reason_for_payment: request?.reason_for_payment || "",
      date_payment_required: request?.date_payment_required ? new Date(request.date_payment_required) : undefined,
      invoice_pdf: undefined,
    },
    values: { // This ensures the form updates when `request` changes
      supplier_name: request?.supplier_name || "",
      sku_number: request?.sku_number || "",
      supplier_address: request?.supplier_address || "",
      iban_number: request?.iban_number || "",
      reason_for_payment: request?.reason_for_payment || "",
      date_payment_required: request?.date_payment_required ? new Date(request.date_payment_required) : undefined,
      invoice_pdf: undefined,
    },
  });

  // Form for declining (admin)
  const declineForm = useForm<z.infer<typeof declineFormSchema>>({
    resolver: zodResolver(declineFormSchema),
    defaultValues: {
      admin_action_reason: "",
    },
  });

  // Form for querying (admin)
  const queryForm = useForm<z.infer<typeof queryFormSchema>>({
    resolver: zodResolver(queryFormSchema),
    defaultValues: {
      query_note: "",
    },
  });

  // Form for receipt upload (admin)
  const receiptUploadForm = useForm<z.infer<typeof receiptUploadSchema>>({
    resolver: zodResolver(receiptUploadSchema),
    defaultValues: {
      receipt_pdf: undefined,
    },
  });

  const updateRequestMutation = useMutation({
    mutationFn: async (updatedFields: Partial<PaymentRequest> & { invoice_file?: File }) => {
      if (!id || !user?.id) throw new Error("Request ID or user ID missing.");

      let invoicePdfUrl = updatedFields.invoice_pdf_url;
      if (updatedFields.invoice_file) {
        const invoiceFile = updatedFields.invoice_file;
        const fileExtension = invoiceFile.name.split('.').pop();
        const fileName = `${user.id}/${crypto.randomUUID()}.${fileExtension}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(fileName, invoiceFile, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Failed to upload new invoice: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from('invoices')
          .getPublicUrl(fileName);

        if (!publicUrlData?.publicUrl) {
          throw new Error("Failed to get public URL for new invoice.");
        }
        invoicePdfUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase
        .from('payment_requests')
        .update({
          ...updatedFields,
          invoice_pdf_url: invoicePdfUrl,
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

  const handleRequesterEditSubmit = async (values: z.infer<typeof editFormSchema>) => {
    const toastId = showLoading("Updating payment request...");
    try {
      const updatedFields: Partial<PaymentRequest> & { invoice_file?: File } = {
        supplier_name: values.supplier_name,
        sku_number: values.sku_number,
        supplier_address: values.supplier_address,
        iban_number: values.iban_number,
        reason_for_payment: values.reason_for_payment,
        date_payment_required: values.date_payment_required.toISOString().split('T')[0],
      };

      if (values.invoice_pdf && values.invoice_pdf.length > 0) {
        updatedFields.invoice_file = values.invoice_pdf[0];
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

      // First, log the query in the audit trail
      const { error: auditError } = await supabase
        .from('payment_request_audits')
        .insert({
          payment_request_id: id,
          changed_by_user_id: user.id,
          change_description: `Admin queried payment: ${values.query_note}`,
        });

      if (auditError) throw new Error(`Failed to log query in audit trail: ${auditError.message}`);

      // Then, update the payment request status to 'queried'
      await handleAdminAction('queried', values.query_note); // Use the existing admin action handler
      dismissToast(toastId);
      showSuccess("Payment queried successfully!");
      queryForm.reset(); // Clear the form
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
      const fileName = `${id}/${crypto.randomUUID()}.${fileExtension}`; // Store receipts by request ID

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
      receiptUploadForm.reset();
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
  const canEdit = isRequester && request.status === 'pending';

  const getStatusDisplay = (status: PaymentRequest['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'setup_awaiting_approval':
        return 'Payment Setup';
      case 'approved':
        return 'Payment Complete';
      case 'declined':
        return 'Declined';
      case 'queried':
        return 'Queried';
      default:
        return status;
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Payment Request #{request.id.substring(0, 8)}</h1>
        {canEdit && !isEditing && (
          <Button onClick={() => setIsEditing(true)} className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground">
            Edit Request
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

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Request Details</CardTitle>
          <CardDescription>Status: <span className={`font-semibold ${
            request.status === 'pending' ? 'text-yellow-600' :
            request.status === 'setup_awaiting_approval' ? 'text-blue-600' :
            request.status === 'approved' ? 'text-green-600' :
            request.status === 'declined' ? 'text-red-600' :
            request.status === 'queried' ? 'text-orange-600' : // New color for queried status
            'text-gray-600'
          }`}>
            {getStatusDisplay(request.status)}
          </span></CardDescription>
        </CardHeader>
        <CardContent>
          {isEditing && canEdit ? (
            <Form {...editForm}>
              <form id="edit-request-form" onSubmit={editForm.handleSubmit(handleRequesterEditSubmit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="supplier_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="sku_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU Number</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="supplier_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier Address</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="iban_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IBAN Number</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="reason_for_payment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason for Payment</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="date_payment_required"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date Payment Required</FormLabel>
                      <FormControl>
                        <DatePicker date={field.value} setDate={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="invoice_pdf"
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Invoice PDF (Upload new if needed)</FormLabel>
                      <FormControl>
                        <Input
                          {...fieldProps}
                          type="file"
                          accept=".pdf"
                          onChange={(event) => onChange(event.target.files)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium">Supplier Name:</p>
                <p>{request.supplier_name}</p>
              </div>
              <div>
                <p className="font-medium">SKU Number:</p>
                <p>{request.sku_number}</p>
              </div>
              <div>
                <p className="font-medium">Supplier Address:</p>
                <p>{request.supplier_address}</p>
              </div>
              <div>
                <p className="font-medium">IBAN Number:</p>
                <p>{request.iban_number}</p>
              </div>
              <div>
                <p className="font-medium">Reason for Payment:</p>
                <p>{request.reason_for_payment}</p>
              </div>
              <div>
                <p className="font-medium">Date Payment Required:</p>
                <p>{format(new Date(request.date_payment_required), 'PPP')}</p>
              </div>
              <div>
                <p className="font-medium">Invoice PDF:</p>
                <Button asChild variant="link" className="p-0 h-auto">
                  <a href={request.invoice_pdf_url} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-1 h-4 w-4" /> Download Invoice
                  </a>
                </Button>
              </div>
              {request.receipt_pdf_url && (
                <div>
                  <p className="font-medium">Receipt PDF:</p>
                  <Button asChild variant="link" className="p-0 h-auto">
                    <a href={request.receipt_pdf_url} target="_blank" rel="noopener noreferrer">
                      <Download className="mr-1 h-4 w-4" /> Download Receipt
                    </a>
                  </Button>
                </div>
              )}
              <div>
                <p className="font-medium">Created At:</p>
                <p>{format(new Date(request.created_at), 'PPP p')}</p>
              </div>
              <div>
                <p className="font-medium">Last Updated:</p>
                <p>{format(new Date(request.updated_at), 'PPP p')}</p>
              </div>
              {request.payment_setup_date && (
                <div>
                  <p className="font-medium">Payment Setup Date:</p>
                  <p>{format(new Date(request.payment_setup_date), 'PPP p')}</p>
                </div>
              )}
              {request.payment_approved_date && (
                <div>
                  <p className="font-medium">Payment Approved Date:</p>
                  <p>{format(new Date(request.payment_approved_date), 'PPP p')}</p>
                </div>
              )}
              {request.admin_action_by && (
                <div>
                  <p className="font-medium">Admin Action By:</p>
                  <p>{auditUsers?.[request.admin_action_by] || request.admin_action_by}</p>
                </div>
              )}
              {request.admin_action_reason && (
                <div>
                  <p className="font-medium">Admin Reason:</p>
                  <p>{request.admin_action_reason}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && request.status !== 'declined' && ( // Admin actions available if not declined
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Admin Actions</CardTitle>
            <CardDescription>Manage this payment request.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            {(request.status === 'pending' || request.status === 'queried') && (
              <>
                <Button
                  onClick={() => handleAdminAction('setup_awaiting_approval')}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={updateRequestMutation.isPending}
                >
                  <DollarSign className="mr-2 h-4 w-4" /> Setup Payment
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="bg-gray-200 hover:bg-gray-300 text-gray-800"
                      disabled={updateRequestMutation.isPending}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" /> Query Payment
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Query Payment Request</AlertDialogTitle>
                      <AlertDialogDescription>
                        Enter a note to query the requester about this payment request. This will be visible in the audit trail and change the request status to 'Queried'.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Form {...queryForm}>
                      <form onSubmit={queryForm.handleSubmit(handleAdminQuery)} className="space-y-4">
                        <FormField
                          control={queryForm.control}
                          name="query_note"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Query Note</FormLabel>
                              <FormControl>
                                <Textarea placeholder="e.g., Please clarify the SKU number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction type="submit" className="bg-dyad-blue text-dyad-blue-foreground">Submit Query</AlertDialogAction>
                        </AlertDialogFooter>
                      </form>
                    </Form>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {request.status === 'setup_awaiting_approval' && (
              <Button
                onClick={() => handleAdminAction('approved')}
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={updateRequestMutation.isPending}
              >
                <CheckCircle className="mr-2 h-4 w-4" /> Approve Payment
              </Button>
            )}
            {(request.status === 'pending' || request.status === 'setup_awaiting_approval' || request.status === 'queried') && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={updateRequestMutation.isPending}
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Decline Payment
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Decline Payment Request</AlertDialogTitle>
                    <AlertDialogDescription>
                      Please provide a reason for declining this payment request. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Form {...declineForm}>
                    <form onSubmit={declineForm.handleSubmit((values) => handleAdminAction('declined', values.admin_action_reason))} className="space-y-4">
                      <FormField
                        control={declineForm.control}
                        name="admin_action_reason"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Reason</FormLabel>
                            <FormControl>
                              <Textarea placeholder="e.g., Insufficient budget, missing information" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction type="submit" className="bg-destructive text-destructive-foreground">Decline</AlertDialogAction>
                      </AlertDialogFooter>
                    </form>
                  </Form>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && request.status === 'approved' && !request.receipt_pdf_url && ( // Receipt upload only if approved and no receipt
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Upload Receipt</CardTitle>
            <CardDescription>Upload the payment receipt once the payment is complete.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...receiptUploadForm}>
              <form onSubmit={receiptUploadForm.handleSubmit(handleReceiptUpload)} className="space-y-4">
                <FormField
                  control={receiptUploadForm.control}
                  name="receipt_pdf"
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Receipt PDF</FormLabel>
                      <FormControl>
                        <Input
                          {...fieldProps}
                          type="file"
                          accept=".pdf"
                          onChange={(event) => onChange(event.target.files)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground" disabled={updateRequestMutation.isPending}>
                  Upload Receipt
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <History className="mr-2 h-5 w-5" /> Audit Trail
          </CardTitle>
          <CardDescription>History of changes for this payment request.</CardDescription>
        </CardHeader>
        <CardContent>
          {audits && audits.length > 0 ? (
            <div className="space-y-4">
              {audits.map((audit) => (
                <div key={audit.id} className="border-l-2 border-gray-200 pl-4">
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(audit.changed_at), 'PPP p')} by {auditUsers?.[audit.changed_by_user_id || ''] || audit.changed_by_user_id || 'System'}
                  </p>
                  <p className="text-base">{audit.change_description}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No audit history available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentRequestDetail;