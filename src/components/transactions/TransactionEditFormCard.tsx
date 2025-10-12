"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod'; // Keep z for other Zod usage if any
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
import PrefixedInput from '@/components/PrefixedInput'; // Import PrefixedInput
import { transactionDetailSchema, TransactionDetailSchema } from '@/schemas/transactionSchema'; // Import centralized schema

interface TransactionEditFormCardProps {
  transaction: Transaction;
  isEditingMode: boolean;
  form: ReturnType<typeof useForm<TransactionDetailSchema>>; // Use centralized schema type
  onSubmit: (values: TransactionDetailSchema) => Promise<void>; // Use centralized schema type
  updateTransactionMutation: UseMutationResult<boolean, Error, Partial<Transaction> & { new_receipt_files?: FileList }, unknown>;
  categoryOptions: { value: string; label: string }[];
}

const TransactionEditFormCard: React.FC<TransactionEditFormCardProps> = ({
  transaction,
  isEditingMode,
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
          <form id="transaction-edit-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Category<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!isEditingMode}>
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
                  <FormLabel className="font-semibold">Merchant Name<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Amazon" {...field} disabled={!isEditingMode} />
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
                    <Textarea placeholder="Add any relevant notes" {...field} disabled={!isEditingMode} />
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
                  <FormLabel className="font-semibold">SKU<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                  <FormControl>
                    <PrefixedInput prefix="CH" placeholder="e.g., 12345" {...field} disabled={!isEditingMode} />
                  </FormControl>
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
                    <Textarea placeholder="Add any relevant comments" {...field} disabled={!isEditingMode} />
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
                  <FormLabel className="font-semibold">Receipt PDF(s)<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                  {/* Removed FormControl wrapper around FileInput */}
                  <FileInput
                    {...fieldProps}
                    label={transaction.receipt_urls && transaction.receipt_urls.length > 0 ? "Add More Receipt PDF(s)" : "Upload Receipt PDF(s)"}
                    accept=".pdf"
                    value={value}
                    onChange={onChange}
                    multiple
                    disabled={!isEditingMode}
                  />
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
            {/* The submit button is now controlled by the parent component */}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default TransactionEditFormCard;