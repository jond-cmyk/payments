"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { DollarSign } from 'lucide-react';

const formSchema = z.object({
  account_name: z.string().min(1, "Account Name is required."),
  account_address: z.string().min(1, "Account Address is required."),
  iban_number: z.string().min(1, "IBAN Number is required."),
  bank_details_verified: z.boolean().refine(val => val === true, "You must confirm bank details have been verified."),
});

type DepositReturnFormValues = z.infer<typeof formSchema>;

interface DepositReturnFormProps {
  customerName: string;
  returnAmount: number;
  currency: string;
  onSubmit: (values: DepositReturnFormValues) => Promise<void>;
  isSubmitting: boolean;
}

const DepositReturnForm: React.FC<DepositReturnFormProps> = ({ customerName, returnAmount, currency, onSubmit, isSubmitting }) => {
  const form = useForm<DepositReturnFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      account_name: "",
      account_address: "",
      iban_number: "",
      bank_details_verified: false,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <p><strong>Customer:</strong> {customerName}</p>
          <p><strong>Return Amount:</strong> {returnAmount.toFixed(2)} {currency}</p>
        </div>
        <FormField
          control={form.control}
          name="account_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="account_address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Address</FormLabel>
              <FormControl>
                <Textarea placeholder="e.g., 123 Bank St, City, Country" {...field} />
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
                <Input placeholder="e.g., CH9300762011623852957" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bank_details_verified"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I have verified these bank details with the customer.
                </FormLabel>
                <FormDescription>
                  Ensure the bank details are correct to avoid payment errors.
                </FormDescription>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          <DollarSign className="mr-2 h-4 w-4" />
          {isSubmitting ? "Creating Request..." : "Create Deposit Return Request"}
        </Button>
      </form>
    </Form>
  );
};

export default DepositReturnForm;