"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Download } from 'lucide-react';
import { UseMutationResult } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import FileInput from '@/components/FileInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Transaction } from '@/types/supabase';

// Zod schema for unified transaction details form
const transactionDetailSchema = z.object({
  category: z.string().optional(),
  merchant_name: z.string().optional(),
  notes: z.string().optional(),
  sku: z.string().optional(),
  // reason_for_payment is removed from the form schema as it will be derived from category
  comment: z.string().optional(),
  new_receipt_files: z.any()
    .optional()
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024), "Max file size is 5MB per file.")
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.type === "application/pdf"), "Only .pdf files are accepted."),
});

interface TransactionEditFormCardProps {
  transaction: Transaction;
  canEdit: boolean;
  form: ReturnType<typeof useForm<z.infer<typeof transactionDetailSchema>>>;
  onSubmit: (values: z.infer<typeof transactionDetailSchema>) => Promise<void>;
  updateTransactionMutation: UseMutationResult<boolean, Error, Partial<Transaction> & { new_receipt_files?: FileList }, unknown>;
  // reasonForPaymentOptions is removed as it's no longer a separate field
  categoryOptions: { value: string; label: string }[];
}

const TransactionEditFormCard: React.FC<TransactionEditFormCardProps> = ({
  transaction,
  canEdit,
  form,
  onSubmit,
  updateTransactionMutation,
  categoryOptions,
}) => {
  return (
    <Card className="max-w-2xl mx-auto mb-8">
      <CardHeader>
        <CardTitle>Edit Transaction Details</CardTitle>
        <CardDescription>Update the details for this transaction.</CardDescription>
      </CardHeader>
      <CardContent>
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
            {/* Removed Reason for Payment field */}
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
  );
};

export default TransactionEditFormCard;