"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import DatePicker from '@/components/DatePicker'; // Import the new DatePicker component
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Define the Zod schema for form validation
const formSchema = z.object({
  supplier_name: z.string().min(1, "Supplier Name is required"),
  sku_number: z.string().min(1, "SKU Number is required"),
  supplier_address: z.string().min(1, "Supplier Address is required"),
  iban_number: z.string().min(1, "IBAN Number is required"),
  reason_for_payment: z.string().min(1, "Reason for Payment is required"),
  date_payment_required: z.date({
    required_error: "Date Payment Required is required",
  }),
  invoice_pdf: z.any()
    .refine((file) => file?.length > 0, "Invoice PDF is required.")
    .refine((file) => file?.[0]?.size <= 5 * 1024 * 1024, "Max file size is 5MB.") // 5MB limit
    .refine((file) => file?.[0]?.type === "application/pdf", "Only .pdf files are accepted."),
});

const NewPaymentRequest = () => {
  const { session, isLoading, user } = useSession();
  const navigate = useNavigate();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplier_name: "",
      sku_number: "",
      supplier_address: "",
      iban_number: "",
      reason_for_payment: "",
      date_payment_required: undefined,
      invoice_pdf: undefined,
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const toastId = showLoading("Creating payment request...");

    try {
      if (!user?.id) {
        throw new Error("User not authenticated.");
      }

      const invoiceFile = values.invoice_pdf[0];
      const fileExtension = invoiceFile.name.split('.').pop();
      const fileName = `${user.id}/${crypto.randomUUID()}.${fileExtension}`;

      // Upload invoice PDF to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(fileName, invoiceFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload invoice: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from('invoices')
        .getPublicUrl(fileName);

      if (!publicUrlData?.publicUrl) {
        throw new Error("Failed to get public URL for invoice.");
      }

      // Insert payment request data into Supabase
      const { error: insertError } = await supabase
        .from('payment_requests')
        .insert({
          requester_id: user.id,
          supplier_name: values.supplier_name,
          sku_number: values.sku_number,
          supplier_address: values.supplier_address,
          iban_number: values.iban_number,
          reason_for_payment: values.reason_for_payment,
          date_payment_required: values.date_payment_required.toISOString().split('T')[0], // Format date to YYYY-MM-DD
          invoice_pdf_url: publicUrlData.publicUrl,
          status: 'pending',
        });

      if (insertError) {
        throw new Error(`Failed to create payment request: ${insertError.message}`);
      }

      dismissToast(toastId);
      showSuccess("Payment request created successfully!");
      form.reset(); // Clear the form
      navigate('/dashboard'); // Redirect to dashboard or requests list
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred.");
      console.error("Error creating payment request:", error);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Create New Payment Request</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="supplier_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., ABC Corp" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sku_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., SKU12345" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplier_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="e.g., 123 Main St, Anytown, USA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="iban_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IBAN Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., GB33BUKB20201555555555" {...field} />
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
                    <FormControl>
                      <Textarea placeholder="e.g., Purchase of office supplies" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date_payment_required"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date Payment Required</FormLabel>
                    <FormControl>
                      <DatePicker
                        date={field.value}
                        setDate={field.onChange}
                        placeholder="Select payment date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="invoice_pdf"
                render={({ field: { value, onChange, ...fieldProps } }) => (
                  <FormItem>
                    <FormLabel>Invoice PDF</FormLabel>
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
              <Button type="submit" className="w-full bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground">
                Submit Payment Request
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default NewPaymentRequest;