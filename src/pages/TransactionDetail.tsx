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
import { FileText, Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import FileInput from '@/components/FileInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Zod schema for transaction details form
const transactionDetailSchema = z.object({
  category: z.string().min(1, "Category is required"),
  merchant_name: z.string().min(1, "Merchant Name is required"),
  notes: z.string().optional(),
  receipt_pdf: z.any()
    .optional()
    .refine((files) => !files || files.length === 0 || files?.[0]?.size <= 5 * 1024 * 1024, "Max file size is 5MB.")
    .refine((files) => !files || files.length === 0 || files?.[0]?.type === "application/pdf", "Only .pdf files are accepted."),
});

const TransactionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { session, isLoading: isSessionLoading, user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userRole, setUserRole] = useState<Profile['role'] | null>(null);

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
      receipt_pdf: undefined,
    },
  });

  useEffect(() => {
    if (transaction) {
      form.reset({
        category: transaction.category || "",
        merchant_name: transaction.merchant_name || "",
        notes: transaction.notes || "",
        receipt_pdf: undefined, // Always reset file input
      });
    }
  }, [transaction, form]);

  const updateTransactionMutation = useMutation({
    mutationFn: async (updatedFields: Partial<Transaction> & { new_receipt_file?: File }) => {
      if (!id || !user?.id) throw new Error("Transaction ID or user ID missing.");

      let receiptUrl = updatedFields.receipt_url;

      if (updatedFields.new_receipt_file) {
        const file = updatedFields.new_receipt_file;
        const fileExtension = file.name.split('.').pop();
        const fileName = `${user.id}/${crypto.randomUUID()}.${fileExtension}`; // Store under user ID

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('transaction_receipts')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Failed to upload receipt: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from('transaction_receipts')
          .getPublicUrl(fileName);

        if (!publicUrlData?.publicUrl) {
          throw new Error("Failed to get public URL for receipt.");
        }
        receiptUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase
        .from('transactions')
        .update({
          ...updatedFields,
          receipt_url: receiptUrl,
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
      const updatedFields: Partial<Transaction> & { new_receipt_file?: File } = {
        category: values.category,
        merchant_name: values.merchant_name,
        notes: values.notes,
      };

      if (values.receipt_pdf && values.receipt_pdf.length > 0) {
        updatedFields.new_receipt_file = values.receipt_pdf[0];
      }

      await updateTransactionMutation.mutateAsync(updatedFields);
      dismissToast(toastId);
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred during update.");
    }
  };

  if (isSessionLoading || isProfileLoading || isTransactionLoading) {
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

  const isAssignedUser = user?.id === transaction.user_id;
  const isAdmin = userRole === 'admin';
  const canEdit = (transaction.status === 'pending_input' || transaction.status === 'completed') && (isAssignedUser || isAdmin);

  return (
    <div className="container mx-auto py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Card Payment Receipt Details</CardTitle>
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
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        <SelectItem value="travel">Travel</SelectItem>
                        <SelectItem value="software">Software</SelectItem>
                        <SelectItem value="office_supplies">Office Supplies</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="utilities">Utilities</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
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
              <FormField
                control={form.control}
                name="receipt_pdf"
                render={({ field: { value, onChange, ...fieldProps } }) => (
                  <FormItem>
                    <FormLabel>Receipt PDF</FormLabel>
                    <FormControl>
                      <FileInput
                        {...fieldProps}
                        label={transaction.receipt_url ? "Change Receipt PDF" : "Upload Receipt PDF"}
                        accept=".pdf"
                        value={value}
                        onChange={onChange}
                        disabled={!canEdit}
                      />
                    </FormControl>
                    <FormMessage />
                    {transaction.receipt_url && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-muted-foreground">Current Receipt:</p>
                        <Button asChild variant="link" className="p-0 h-auto text-sm block">
                          <a href={transaction.receipt_url} target="_blank" rel="noopener noreferrer">
                            <Download className="mr-1 h-4 w-4" /> View Current Receipt
                          </a>
                        </Button>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TransactionDetail;