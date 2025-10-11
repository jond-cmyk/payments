"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Transaction, Profile } from '@/types/supabase';
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

// List of common reasons for payment (from NewPaymentRequest)
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

// List of common categories (from old TransactionDetail)
const categoryOptions = [
  { value: 'travel', label: 'Travel' },
  { value: 'software', label: 'Software' },
  { value: 'office_supplies', label: 'Office Supplies' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'other', label: 'Other' },
].sort((a, b) => a.label.localeCompare(b.label));

// Zod schema for unified transaction details form
const transactionDetailSchema = z.object({
  category: z.string().optional(), // Now optional for general transactions
  merchant_name: z.string().optional(), // Now optional for general transactions
  notes: z.string().optional(),
  sku: z.string().optional(), // Now optional for card transactions
  reason_for_payment: z.string().optional(), // Now optional for card transactions
  comment: z.string().optional(), // Unified comment/notes field
  new_receipt_files: z.any()
    .optional()
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024), "Max file size is 5MB per file.")
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.type === "application/pdf"), "Only .pdf files are accepted."),
});

const TransactionDetail = () => {
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

  // Fetch transaction details
  const { data: transaction, isLoading: isTransactionLoading, error: transactionError } = useQuery<Transaction | null>({
    queryKey: ['transaction', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const form = useForm<z.infer<typeof transactionDetailSchema>>({
    resolver: zodResolver(transactionDetailSchema),
    defaultValues: {
      category: "",
      merchant_name: "",
      notes: "",
      sku: "",
      reason_for_payment: "",
      comment: "",
      new_receipt_files: undefined,
    },
  });

  useEffect(() => {
    if (transaction) {
      form.reset({
        category: transaction.category || "",
        merchant_name: transaction.merchant_name || "",
        notes: transaction.notes || "",
        sku: transaction.sku || "",
        reason_for_payment: transaction.reason_for_payment || "",
        comment: transaction.comment || "",
        new_receipt_files: undefined, // Always reset file input
      });
    }
  }, [transaction, form]);

  const updateTransactionMutation = useMutation({
    mutationFn: async (updatedFields: Partial<Transaction> & { new_receipt_files?: FileList }) => {
      if (!id || !user?.id) throw new Error("Transaction ID or user ID missing.");

      let updatedReceiptUrls = transaction?.receipt_urls || [];

      if (updatedFields.new_receipt_files && updatedFields.new_receipt_files.length > 0) {
        const newUploadedUrls: string[] = [];
        for (let i = 0; i < updatedFields.new_receipt_files.length; i++) {
          const file = updatedFields.new_receipt_files[i];
          const fileExtension = file.name.split('.').pop();
          const fileName = `${user.id}/transactions/${crypto.randomUUID()}.${fileExtension}`; // Store under user ID and transactions folder

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('transaction_receipts')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`Failed to upload receipt ${file.name}: ${uploadError.message}`);
          }

          const { data: publicUrlData } = supabase.storage
            .from('transaction_receipts')
            .getPublicUrl(fileName);

          if (!publicUrlData?.publicUrl) {
            throw new Error(`Failed to get public URL for receipt ${file.name}.`);
          }
          newUploadedUrls.push(publicUrlData.publicUrl);
        }
        updatedReceiptUrls = [...updatedReceiptUrls, ...newUploadedUrls];
      }

      const { error } = await supabase
        .from('transactions')
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
      queryClient.invalidateQueries({ queryKey: ['transaction', id] });
      queryClient.invalidateQueries({ queryKey: ['myTransactions'] });
      showSuccess("Transaction updated successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update transaction.");
      console.error("Update transaction error:", error);
    },
  });

  const onSubmit = async (values: z.infer<typeof transactionDetailSchema>) => {
    const toastId = showLoading("Updating transaction...");
    try {
      const updatedFields: Partial<Transaction> & { new_receipt_files?: FileList } = {
        category: values.category,
        merchant_name: values.merchant_name,
        notes: values.notes,
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
    return <div className="flex items-center justify-center h-full text-lg">Loading transaction details...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (transactionError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading transaction: {transactionError.message}</div>;
  }

  if (!transaction) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Transaction not found.</div>;
  }

  const isAssignedUser = user?.id === transaction.requester_id;
  const isAdmin = userRole === 'admin';
  const canEdit = transaction.status === 'pending_input' && (isAssignedUser || isAdmin);

  return (
    <>
      <div className="container mx-auto py-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Transaction Details</CardTitle>
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
              {transaction.original_transaction_id && (
                <div>
                  <p className="font-medium">Original Transaction ID:</p>
                  <p>{transaction.original_transaction_id}</p>
                </div>
              )}
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
                {/* Fields for card transactions */}
                {transaction.original_transaction_id && (
                  <>
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!canEdit}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categoryOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
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
                      name="merchant_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Merchant Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Amazon" {...field} disabled={!canEdit} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Add any relevant notes" {...field} disabled={!canEdit} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Fields for general transactions */}
                {!transaction.original_transaction_id && (
                  <>
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
                  </>
                )}

                <FormField
                  control={form.control}
                  name="new_receipt_files"
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Receipt PDF(s)</FormLabel>
                      <FormControl>
                        <FileInput
                          {...fieldProps}
                          label={transaction.receipt_urls && transaction.receipt_urls.length > 0 ? "Add More Receipt PDF(s)" : "Upload Receipt PDF(s)"}
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

export default TransactionDetail;