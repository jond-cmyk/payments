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

const createFormSchema = (country: string) => z.object({
  bank_account_name: z.string().min(1, "Bank Account Name is required."),
  account_address: z.string().min(1, "Account Address is required."),
  iban_number: z.string().optional(),
  sort_code: z.string().optional(),
  account_number: z.string().optional(),
  overseas_bank_account: z.boolean().default(false),
  bank_details_verified: z.boolean().refine(val => val === true, "You must confirm bank details have been verified."),
}).superRefine((data, ctx) => {
  if (country === 'United Kingdom') {
    if (data.overseas_bank_account) {
      if (!data.iban_number || data.iban_number.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "IBAN Number is required for overseas accounts.",
          path: ['iban_number'],
        });
      }
    } else {
      if (!data.sort_code || !/^\d{2}-\d{2}-\d{2}$/.test(data.sort_code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Sort Code is required and must be in XX-XX-XX format.",
          path: ['sort_code'],
        });
      }
      if (!data.account_number || !/^\d{8}$/.test(data.account_number.replace(/\s/g, ''))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Bank Account Number is required and must be 8 digits.",
          path: ['account_number'],
        });
      }
    }
  } else { // For non-UK countries
    if (!data.iban_number || data.iban_number.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN Number is required.",
        path: ['iban_number'],
      });
    }
  }
});

interface DepositReturnFormProps {
  customerName: string;
  returnAmount: number;
  currency: string;
  country: string;
  onSubmit: (values: any) => Promise<void>;
  isSubmitting: boolean;
}

const DepositReturnForm: React.FC<DepositReturnFormProps> = ({ customerName, returnAmount, currency, country, onSubmit, isSubmitting }) => {
  const formSchema = createFormSchema(country);
  type DepositReturnFormValues = z.infer<typeof formSchema>;

  const form = useForm<DepositReturnFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      bank_account_name: "",
      account_address: "",
      iban_number: "",
      sort_code: "",
      account_number: "",
      overseas_bank_account: false,
      bank_details_verified: false,
    },
  });

  const isUk = country === 'United Kingdom';
  const isOverseas = form.watch('overseas_bank_account');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <p><strong>Customer:</strong> {customerName}</p>
          <p><strong>Return Amount:</strong> {returnAmount.toFixed(2)} {currency}</p>
        </div>
        <FormField
          control={form.control}
          name="bank_account_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bank Account Name</FormLabel>
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

        {isUk && (
          <FormField
            control={form.control}
            name="overseas_bank_account"
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
                    This is an overseas (non-UK) bank account.
                  </FormLabel>
                  <FormDescription>
                    Check this box to provide an IBAN instead of Sort Code and Account Number.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        )}

        {(!isUk || (isUk && isOverseas)) && (
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
        )}

        {isUk && !isOverseas && (
          <>
            <FormField
              control={form.control}
              name="sort_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 12-34-56"
                      {...field}
                      onChange={(e) => {
                        let value = e.target.value.replace(/\D/g, '');
                        if (value.length > 6) value = value.substring(0, 6);
                        if (value.length > 4) value = value.slice(0, 2) + '-' + value.slice(2, 4) + '-' + value.slice(4);
                        else if (value.length > 2) value = value.slice(0, 2) + '-' + value.slice(2);
                        field.onChange(value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="account_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 12345678"
                      {...field}
                      onChange={(e) => {
                        let value = e.target.value.replace(/\D/g, '');
                        if (value.length > 8) value = value.substring(0, 8);
                        field.onChange(value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

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