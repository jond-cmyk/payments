"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GeneralTransaction, Profile } from '@/types/supabase';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Download, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import FileInput from '@/components/FileInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// List of common reasons for payment
const reasonForPaymentOptions = [
  { value: 'office_supplies', label: 'Office Supplies' },
  { value: 'travel_expenses', label: 'Travel Expenses' },
  { value: 'software_subscription', label: 'Software Subscription' },
  { value: 'marketing_campaign', label: 'Marketing Campaign' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'consulting_fees', label: 'Consulting Fees' },
  { value: 'rent', label: 'Rent' },
  { value: 'salaries', label: 'Salaries' },
  { value: 'other', label: 'Other' },
].sort((a, b) => a.label.localeCompare(b.label));

// Zod schema for general transaction details form
const generalTransactionDetailSchema = z.object({
  sku: z.string().optional(),
  reason_for_payment: z.string().optional(),
  comment: z.string().optional(),
  new_receipt_files: z.any()
    .optional()
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024), "Max file size is 5MB per file.")
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.type === "application/pdf"), "Only .pdf files are accepted."),
});

const GeneralTransactionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userRole, setUserRole] = useState<Profile['role'] | null>(null);

  useEffect(() => {
    if (userProfile) {
      setUserRole(userProfile.role);
    }
  }, [userProfile]);

  // Fetch general transaction details
  const { data: transaction, isLoading: isTransactionLoading, error: transactionError } = useQuery<GeneralTransaction | null>({
    queryKey: ['generalTransaction', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('general_transactions')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const form = useForm<z.infer<typeof generalTransactionDetailSchema>>({
    resolver: zodResolver(generalTransactionDetailSchema),
    defaultValues: {
      sku: "",
      reason_for_payment: "",
      comment: "",
      new_receipt_files: undefined,
    },
  });

  useEffect(() => {
    if (transaction) {
      form.reset({
        sku: transaction.sku || "",
        reason_for_payment: transaction.reason_for_payment || "",
        comment: transaction.comment || "",
        new_receipt_files: undefined, // Always reset file input
      });
    }
  }, [transaction, form]);

  const updateTransactionMutation = useMutation({
    mutationFn: async (updatedFields: Partial<GeneralTransaction> & { new_receipt_files?: FileList }) => {
      if (!id || !user?.id) throw new Error("Transaction ID or user ID missing.");

      let updatedReceiptUrls = transaction?.receipt_urls || [];

      if (updatedFields.new_receipt_files && updatedFields.new_receipt_files.length > 0) {
        const newUploadedUrls: string[] = [];
        for (let i = 0; i < updatedFields.new_receipt_files.length; i++) {
          const file = updatedFields.new_receipt_files[i];
          const fileExtension = file.name.split('.').pop();
          const fileName = `${user.id}/general_transactions/${crypto.randomUUID()}.${fileExtension}`; // Store under user ID and general_transactions folder

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('general_transaction_receipts') // New storage bucket for general transaction receipts
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`Failed to upload receipt ${file.name}: ${uploadError.message}`);
          }

          const { data: publicUrlData } = supabase.storage
            .from('general_transaction_receipts')
            .getPublicUrl(fileName);

          if (!publicUrlData?.publicUrl) {
            throw new Error(`Failed to get public URL for receipt ${file.name}.`);
          }
          newUploadedUrls.push(publicUrlData.publicUrl);
        }
        updatedReceiptUrls = [...updatedReceiptUrls, ...newUploadedUrls];
      }

      const { error } = await supabase
        .from('general_transactions')
        .update({
          ...updatedFields,
          receipt_urls: updatedReceiptUrls,
          updated_at: new Date().toISOString(),
          status: 'completed', // Automatically set to completed after user input
        })
        .eq('id', id);

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generalTransaction', id] });
      queryClient.invalidateQueries({ queryKey: ['myGeneralTransactions'] });
      showSuccess("General transaction updated successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update general transaction.");
      console.error("Update general transaction error:", error);
    },
  });

  const onSubmit = async (values: z.infer<typeof generalTransactionDetailSchema>) => {
    const toastId = showLoading("Updating general transaction...");
    try {
      const updatedFields: Partial<GeneralTransaction> & { new_receipt_files?: FileList } = {
        sku: values.sku,
        reason_for_payment: values.reason_for_payment,
        comment: values.comment,
      };

      if (values.new_receipt_files && values.new_receipt_files.length > 0) {
        updatedFields.new_receipt_files = values.new_receipt_files;
      }

      await updateTransactionMutation.mutateAsync(updatedFields);
      dismissToast(toastId);
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred during update.");
    }
  };

  if (isSessionLoading || isTransactionLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading general transaction details...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (transactionError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading general transaction: {transactionError.message}</div>;
  }

  if (!transaction) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">General transaction not found.</div>;
  }

  const isAssignedUser = user?.id === transaction.requester_id;
  const isAdmin = userRole === 'admin';
  const canEdit = transaction.status === 'pending_input' && (isAssignedUser || isAdmin);

  return (
    <>
      <div className="container mx-auto py-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">General Transaction Details</CardTitle>
            <CardDescription className="text-center">
              Transaction ID: {transaction.id.substring(0, 8)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6">
              <div>
                <p className="font-medium">Transaction Date:</p>
                <p>{format(new Date(transaction.transaction_date), 'PPP')}</p>
              </div>
              <div>
                <p className="font-medium">Description:</p>
                <p>{transaction.description}</p>
              </div>
              <div>
                <p className="font-medium">Amount:</p>
                <p>{transaction.currency} {transaction.amount.toFixed(2)}</p>
              </div>
              <div>
                <p className="font-medium">Status:</p>
                <p className={`font-semibold ${
                  transaction.status === 'pending_input' ? 'text-yellow-600' :
                  transaction.status === 'completed' ? 'text-blue-600' :
                  transaction.status === 'approved' ? 'text-green-600' :
                  transaction.status === 'declined' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {transaction.status.replace(/_/g, ' ').charAt(0).toUpperCase() + transaction.status.replace(/_/g, ' ').slice(1)}
                </p>
              </div>
              {transaction.type && (
                <div>
                  <p className="font-medium">Type:</p>
                  <p>{transaction.type}</p>
                </div>
              )}
              {transaction.entry && (
                <div>
                  <p className="font-medium">Entry:</p>
                  <p>{transaction.entry}</p>
                </div>
              )}
              {transaction.bank && (
                <div>
                  <p className="font-medium">Bank:</p>
                  <p>{transaction.bank}</p>
                </div>
              )}
              {transaction.contra_account && (
                <div>
                  <p className="font-medium">Contra Account:</p>
                  <p>{transaction.contra_account}</p>
                </div>
              )}
              {transaction.exchange_rate && (
                <div>
                  <p className="font-medium">Exchange Rate:</p>
                  <p>{transaction.exchange_rate}</p>
                </div>
              )}
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., CH12345" {...field} disabled={!canEdit} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reason_for_payment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason for Payment</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!canEdit}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a reason" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {reasonForPaymentOptions.map((reason) => (
                            <SelectItem key={reason.value} value={reason.value}>
                              {reason.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="comment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comment</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Add any relevant comments" {...field} disabled={!canEdit} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="new_receipt_files"
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Receipt PDF(s)</FormLabel>
                      <FormControl>
                        <FileInput
                          {...fieldProps}
                          label="Choose Receipt PDF(s)"
                          accept=".pdf"
                          value={value}
                          onChange={onChange}
                          multiple // Enable multiple file selection
                          disabled={!canEdit}
                        />
                      </FormControl>
                      <FormMessage />
                      {transaction.receipt_urls && transaction.receipt_urls.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-sm font-medium text-muted-foreground">Current Receipt(s):</p>
                          {transaction.receipt_urls.map((url, index) => (
                            <Button asChild variant="link" className="p-0 h-auto text-sm block" key={index}>
                              <a href={url} target="_blank" rel="noopener noreferrer">
                                <Download className="mr-1 h-4 w-4" /> Receipt {index + 1}
                              </a>
                            </Button>
                          ))}
                        </div>
                      )}
                    </FormItem>
                  )}
                />
                {canEdit && (
                  <Button type="submit" className="w-full bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground" disabled={updateTransactionMutation.isPending}>
                    {updateTransactionMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default GeneralTransactionDetail;