"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { Edit } from 'lucide-react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';
import { DirectDebit, PayeeSuggestion } from '@/types/supabase';
import { majorCurrencies } from '@/schemas/paymentRequestSchema';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import PrefixedInput from '@/components/PrefixedInput';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import MultiSelectFormField from '@/components/MultiSelectFormField';
import PropertyAddressField from '@/components/PropertyAddressField';

// Zod schema for editing a direct debit
const editDirectDebitFormSchema = z.object({
  payee: z.string().min(1, "Payee is required."),
  payment_day: z
    .number({
      required_error: "Payment Day is required.",
      invalid_type_error: "Payment Day must be a number.",
    })
    .int()
    .min(1, "Day must be between 1 and 31.")
    .max(31, "Day must be between 1 and 31."),
  sku: z.string().optional(),
  not_property_related: z.boolean().default(false),
  categories: z.array(z.string()).min(1, "At least one category is required."),
  total_amount: z.coerce.number().min(0.01, "Total amount must be positive."),
  account_number: z.string().min(1, "Supplier Account Number is required."),
  payment_reference: z.string().optional(),
  status: z.enum(['active', 'cancelled', 'paused', 'awaiting_info'], {
    required_error: "Status is required.",
  }).default('active'),
  country: z.string().min(1, "Country is required."),
  bank_account: z.string().optional(),
  currency: z.string().optional(),
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

  if (data.country === 'Switzerland') {
    if (!data.bank_account || data.bank_account.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank Account is required for Switzerland.",
        path: ['bank_account'],
      });
    }
    if (!data.currency || data.currency.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency is required for Switzerland.",
        path: ['currency'],
      });
    }
  } else if (data.country === 'United Kingdom') {
    if (data.currency !== 'GBP') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency must be GBP for United Kingdom.",
        path: ['currency'],
      });
    }
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
      payment_day: directDebit.payment_day !== null && directDebit.payment_day !== undefined ? directDebit.payment_day : undefined,
      sku: directDebit.sku || (directDebit.country === 'United Kingdom' ? 'UK' : 'CH'),
      not_property_related: directDebit.not_property_related,
      categories: directDebit.categories || [],
      total_amount: directDebit.total_amount,
      account_number: directDebit.account_number,
      payment_reference: directDebit.payment_reference || "",
      status: directDebit.status,
      country: directDebit.country,
      bank_account: directDebit.bank_account || undefined,
      currency: directDebit.currency || undefined,
    },
  });

  const notPropertyRelated = form.watch("not_property_related");
  const formCountry = form.watch("country");
  const skuValue = form.watch("sku");
  const isAdmin = userProfile?.role === 'admin';
  const isRequester = user?.id === directDebit.requester_id;

  const onSubmit = async (values: z.infer<typeof editDirectDebitFormSchema>) => {
    const toastId = showLoading("Updating direct debit...");

    try {
      if (!user?.id) {
        throw new Error("User not authenticated.");
      }

      const prevDate = directDebit.payment_date ? new Date(directDebit.payment_date + 'T00:00:00Z') : new Date();
      const year = prevDate.getUTCFullYear();
      const monthIndex = prevDate.getUTCMonth();
      
      const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
      const safeDay = values.payment_day ? Math.min(values.payment_day, lastDayOfMonth) : null;
      
      const paymentDate = new Date(Date.UTC(year, monthIndex, safeDay || 1)).toISOString().split('T')[0];

      // FIX: Use original country if form value is missing (due to disabled field for non-admins)
      const countryForUpdate = (values.country && values.country.trim() !== '') ? values.country : directDebit.country;

      const { error: updateError } = await supabase
        .from('direct_debits')
        .update({
          payee: values.payee,
          payment_date: paymentDate,
          sku: values.not_property_related ? null : values.sku,
          not_property_related: values.not_property_related,
          categories: values.categories,
          total_amount: values.total_amount,
          account_number: values.account_number,
          payment_reference: values.payment_reference || null,
          status: values.status,
          country: countryForUpdate,
          bank_account: countryForUpdate === 'Switzerland' ? values.bank_account : null,
          currency: countryForUpdate === 'United Kingdom' ? 'GBP' : (countryForUpdate === 'Switzerland' ? values.currency : null),
          updated_at: new Date().toISOString(),
          payment_day: values.payment_day,
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

  const filteredCategoryOptions = categoryOptions.filter(option =>
    !option.countries || option.countries.includes(formCountry)
  ).map(opt => ({ value: opt.value, label: opt.label }));

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Country</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={!isAdmin}>
                  <SelectTrigger id={field.name}>
                    <FormControl>
                      <SelectValue placeholder="Select a country" />
                    </FormControl>
                  </SelectTrigger>
                  <SelectContent>
                    {availableCountries.filter(c => c.value !== 'all').map((country) => (
                      <SelectItem key={country.value} value={country.value}>
                        {country.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {isAdmin ? "Select the country for this direct debit." : "Only administrators can change the country."}
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
                  <Input 
                    placeholder="e.g., Electricity Company" 
                    {...field} 
                    disabled={form.formState.isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="payment_day"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="font-semibold">
                  Payment Day (Day of Month)
                  <span className="text-red-600 ml-1 text-lg font-bold">*</span>
                </FormLabel>
                <FormControl>
                  <Select
                    onValueChange={(val) => field.onChange(Number(val))}
                    value={field.value !== undefined ? String(field.value) : undefined}
                  >
                    <SelectTrigger id={field.name}>
                      <SelectValue placeholder="Select day (1–31)" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <PrefixedInput prefix={formCountry === 'United Kingdom' ? 'UK' : 'CH'} placeholder="e.g., 12345" {...field} disabled={notPropertyRelated} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <PropertyAddressField skuValue={skuValue} country={formCountry} />
          <FormField
            control={form.control}
            name="not_property_related"
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
            name="categories"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Categories<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                <FormControl>
                  <MultiSelectFormField
                    options={filteredCategoryOptions}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select categories..."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="total_amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Total Amount<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                <FormControl>
                  <Input 
                    type="number"
                    step="0.01" 
                    placeholder="0.00" 
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {formCountry === 'Switzerland' ? (
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Currency<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger id={field.name}>
                      <FormControl>
                        <SelectValue placeholder="Select a currency" />
                      </FormControl>
                    </SelectTrigger>
                    <SelectContent>
                      {majorCurrencies.map((currency) => (
                        <SelectItem key={currency.value} value={currency.value}>
                          {currency.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : formCountry === 'United Kingdom' ? (
            <div className="space-y-2">
              <FormLabel className="font-semibold">Currency</FormLabel>
              <Input value="GBP - British Pound (Fixed)" disabled className="bg-muted/50" />
              <FormDescription>Currency is fixed to GBP for United Kingdom.</FormDescription>
            </div>
          ) : null}
          {formCountry === 'Switzerland' && (
            <FormField
              control={form.control}
              name="bank_account"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Bank Account<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger id={field.name}>
                      <FormControl>
                        <SelectValue placeholder="Select a bank account" />
                      </FormControl>
                    </SelectTrigger>
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
                <FormLabel className="font-semibold">Supplier Account Number<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 1234567890" {...field} />
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
                <FormLabel className="font-semibold">Payment Reference</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., DD-12345" {...field} />
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
                  <SelectTrigger id={field.name}>
                    <FormControl>
                      <SelectValue placeholder="Select status" />
                    </FormControl>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="awaiting_info">Awaiting Info</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {isAdmin ? "Select the current status of this direct debit." : "Only administrators can change the status."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            <Edit className="mr-2 h-4 w-4" />
            {form.formState.isSubmitting ? "Saving Changes..." : "Save Changes"}
          </Button>
        </form>
      </Form>
    </>
  );
};

export default EditDirectDebitForm;