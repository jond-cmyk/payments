"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod'; // Added missing import
import * as z from 'zod';
import { UseMutationResult } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import FileInput from '@/components/FileInput';
import { PaymentRequest } from '@/types/supabase';

// Zod schema for admin receipt upload
const receiptUploadSchema = z.object({
  receipt_pdf: z.any()
    .refine((file) => file?.length > 0, "Receipt PDF is required.")
    .refine((file) => file?.[0]?.size <= 5 * 1024 * 1024, "Max file size is 5MB.") // 5MB limit
    .refine((file) => file?.[0]?.type === "application/pdf", "Only .pdf files are accepted."),
});

interface AdminReceiptUploadCardProps {
  request: PaymentRequest;
  isAdmin: boolean;
  updateRequestMutation: UseMutationResult<boolean, Error, Partial<PaymentRequest> & { new_invoice_files?: FileList }, unknown>;
  handleReceiptUpload: (values: z.infer<typeof receiptUploadSchema>) => Promise<void>;
}

const AdminReceiptUploadCard: React.FC<AdminReceiptUploadCardProps> = ({
  request,
  isAdmin,
  updateRequestMutation,
  handleReceiptUpload,
}) => {
  const receiptUploadForm = useForm<z.infer<typeof receiptUploadSchema>>({
    resolver: zodResolver(receiptUploadSchema),
    defaultValues: {
      receipt_pdf: undefined,
    },
  });

  if (!isAdmin || request.status !== 'approved' || !request.receipt_required || request.receipt_pdf_url) {
    return null;
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Upload Receipt</CardTitle>
        <CardDescription>Upload the payment receipt once the payment is complete.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...receiptUploadForm}>
          <form id="receipt-upload-form" onSubmit={receiptUploadForm.handleSubmit(handleReceiptUpload)} className="space-y-4">
            <FormField
              control={receiptUploadForm.control}
              name="receipt_pdf"
              render={({ field: { value, onChange, ...fieldProps } }) => (
                <FormItem>
                  <FormLabel>Receipt PDF</FormLabel>
                  <FormControl>
                    <FileInput
                      {...fieldProps}
                      label="Choose Receipt PDF"
                      accept=".pdf"
                      value={value}
                      onChange={onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={updateRequestMutation.isPending}>
              Upload Receipt
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default AdminReceiptUploadCard;