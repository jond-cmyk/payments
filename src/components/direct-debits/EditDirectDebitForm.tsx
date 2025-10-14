"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { Edit } from 'lucide-react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';
import { DirectDebit } from '@/types/supabase';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import DatePicker from '@/components/DatePicker';
import PrefixedInput from '@/components/PrefixedInput';

// Zod schema for editing a direct debit
const editDirectDebitFormSchema = z.object({
  payee: z.string().min(1, "Payee is required."),
  payment_date: z.date({
    required_error: "Payment Date is required.",
  }),
  sku: z.string().optional(),
  not_property_related: z.boolean().default(false),
  category: z.string().min(1, "Category is required."),
  account_number: z.string().min(1, "Account Number is required."),
  payment_reference: z.string().min(1, "Payment Reference is required."),
  status: z.enum(['active', 'cancelled', 'paused'], {
    required_error: "Status is required.",
  }).default('active'),
  country: z.string().min(1, "Country is required."),
  bank_account: z.string().optional(),
}).superRefine((data, ctx) => {
  const skuPrefix = data.country === 'United Kingdom' ? 'UK' : 'CH';

  if (!data.not_property_related) {
    if (!data.sku || data.sku.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU is required unless 'Not Property Related' is checked.`,
        path: ['sku'],
      });
    } else if (!data.sku.startsWith(skuPrefix)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU must start with '${skuPrefix}'.`,
        path: ['sku'],
      });
    } else if (!new RegExp(`^${skuPrefix}\\d+$`).test(data.sku)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU must be '${skuPrefix}' followed by numbers.`,
        path: ['sku'],
      });
    }
  }

  if (data.country === 'Switzerland' && (!data.bank_account || data.bank_account.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bank Account is required for Switzerland.",
      path: ['bank_account'],
    });
  }
});

interface EditDirectDebitFormProps {
  directDebit: DirectDebit;
  onDirectDebitUpdated: () => void;
}

const EditDirectDebitForm: React.FC<EditDirectDebitFormProps> = ({ directDebit, onDirectDebitUpdated }) => {
  const { user, userProfile } = useSession();
  const { availableCountries } = useCountry();

  const form = useForm<z.infer<typeof editDirectDebitFormSchema>>({
    resolver: zodResolver(editDirectDebitFormSchema),
    defaultValues: {
      payee: directDebit.payee,
      payment_date: new Date(directDebit.payment_date),
      sku: directDebit.sku || (directDebit.country === 'United Kingdom' ? 'UK' : 'CH'),
      not_property_related: directDebit.not_property_related,
      category: directDebit.category,
      account_number: directDebit.account_number,
      payment_reference: directDebit.payment_reference,
      status: directDebit.status,
      country: directDebit.country,
      bank_account: directDebit.bank_account || undefined,
    },
  });

  const notPropertyRelated = form.watch("not_property_related");
  const formCountry = form.watch("country");
  const isAdmin = userProfile?.role === 'admin';

  const onSubmit = async (values: z.infer<typeof editDirectDebitFormSchema>) => {
    const toastId = showLoading("Updating direct debit...");

    try {
      if (!user?.id) {
        throw new Error("User not authenticated.");
      }

      const { error: updateError } = await supabase
        .from('direct_debits')
        .update({
          payee: values.payee,
          payment_date: values.payment_date.toISOString().split('T')[0],
          sku: values.not_property_related ? null : values.sku,
          not_property_related: values.not_property_related,
          category: values.category,
          account_number: values.account_number,
          payment_reference: values.payment_reference,
          status: values.status,
          country: values.country,
          bank_account: values.country === 'Switzerland' ? values.bank_account : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', directDebit.id);

      if (updateError) {
        throw new Error(`Failed to update direct debit: ${updateError.message}`);
      }

      dismissToast(toastId);
      showSuccess("Direct Debit updated successfully!");
      onDirectDebitUpdated();
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred.");
      console.error("Error updating direct debit:", error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="country"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Country</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={!isAdmin}> {/* Only admin can change country */}
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a country" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {availableCountries.filter(c => c.value !== 'all').map((country) => (
                    <SelectItem key={country.value} value={country.value}>
                      {country.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {isAdmin ? "Select the country for this direct debit." : "Your country is set by your profile and cannot be changed."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="payee"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Payee<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
              <FormControl>
                <Input placeholder="e.g., Electricity Company" {...field} disabled={!isAdmin} /> {/* Disabled for non-admins */}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/*
        <FormField
          control={form.control}
          name="payment_date"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel className="font-semibold">Payment Date<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
              <FormControl>
                <DatePicker
                  date={field.value}
                  setDate={field.onChange}
                  placeholder="Select payment date"
                  disabled={!isAdmin}
                />
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
              <FormLabel className="font-semibold">SKU</FormLabel>
              <FormControl>
                <PrefixedInput prefix={formCountry === 'United Kingdom' ? 'UK' : 'CH'} placeholder="e.g., 12345" {...field} disabled={notPropertyRelated || !isAdmin} />
              </FormControl>
              <FormDescription>
                {notPropertyRelated ? "SKU field is optional as 'Not Property Related' is checked." : `SKU must start with '${formCountry === 'United Kingdom' ? 'UK' : 'CH'}' and be followed by numbers.`}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="not_property_related"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={!isAdmin}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  Not Property Related
                </FormLabel>
                <FormDescription>
                  Check this box if this direct debit is not associated with a property SKU.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Category<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!isAdmin}>
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
        {formCountry === 'Switzerland' && (
          <FormField
            control={form.control}
            name="bank_account"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Bank Account<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={!isAdmin}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a bank account" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="UBS - CHF">UBS - CHF</SelectItem>
                    <SelectItem value="UBS - EUR">UBS - EUR</SelectItem>
                    <SelectItem value="UBS - DKK">UBS - DKK</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="account_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Account Number<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
              <FormControl>
                <Input placeholder="e.g., 1234567890" {...field} disabled={!isAdmin} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="payment_reference"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Payment Reference<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
              <FormControl>
                <Input placeholder="e.g., DD-12345" {...field} disabled={!isAdmin} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Status<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!isAdmin}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                {isAdmin ? "Select the current status of this direct debit." : "Only administrators can change the status."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        */}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || !isAdmin}> {/* Disabled for non-admins */}
          <Edit className="mr-2 h-4 w-4" />
          {form.formState.isSubmitting ? "Saving Changes..." : "Save Changes"}
        </Button>
      </form>
    </Form>
  );
};

export default EditDirectDebitForm;