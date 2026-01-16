"use client";

import React, { useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { PlusCircle } from 'lucide-react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';
import { majorCurrencies } from '@/schemas/paymentRequestSchema';
import { PayeeSuggestion } from '@/types/supabase';

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

// Zod schema for adding a new direct debit
const addDirectDebitFormSchema = z.object({
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
        message: `SKU is required unless 'Not SKU Related' is checked.`,
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
  } else if (data.country === 'Ireland') {
    if (!data.currency || data.currency.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency is required for Ireland.",
        path: ['currency'],
      });
    }
  }
});

interface AddDirectDebitFormProps {
  onDirectDebitAdded: () => void;
}

const AddDirectDebitForm: React.FC<AddDirectDebitFormProps> = ({ onDirectDebitAdded }) => {
  const { user, userProfile } = useSession();
  const { currentCountry, availableCountries, isCountryLocked } = useCountry();

  const initialCountry = currentCountry === 'all' ? 'Switzerland' : currentCountry;
  const isAdmin = userProfile?.role === 'admin';

  const form = useForm<z.infer<typeof addDirectDebitFormSchema>>({
    resolver: zodResolver(addDirectDebitFormSchema),
    defaultValues: {
      payee: "",
      payment_day: undefined,
      sku: initialCountry === 'United Kingdom' ? 'UK' : 'CH',
      not_property_related: false,
      categories: [],
      total_amount: 0,
      account_number: "",
      payment_reference: "",
      status: "active",
      country: initialCountry,
      bank_account: undefined,
      currency: initialCountry === 'United Kingdom' ? 'GBP' : (initialCountry === 'Switzerland' ? 'CHF' : (initialCountry === 'Ireland' ? 'EUR' : undefined)),
    },
  });

  const notPropertyRelated = form.watch("not_property_related");
  const formCountry = form.watch("country");
  const skuValue = form.watch("sku");

  React.useEffect(() => {
    const newSkuPrefix = formCountry === 'United Kingdom' ? 'UK' : 'CH';
    const newCurrency = formCountry === 'United Kingdom' ? 'GBP' : (formCountry === 'Switzerland' ? 'CHF' : (formCountry === 'Ireland' ? 'EUR' : undefined));
    form.reset((prev) => ({
      ...prev,
      sku: newSkuPrefix,
      country: formCountry,
      bank_account: undefined,
      currency: newCurrency,
      categories: [],
      total_amount: 0,
    }));
  }, [formCountry, form]);

  const onSubmit = async (values: z.infer<typeof addDirectDebitFormSchema>) => {
    const toastId = showLoading("Adding new direct debit...");

    try {
      if (!user?.id) {
        throw new Error("User not authenticated.");
      }

      const now = new Date();
      const year = now.getFullYear();
      const monthIndex = now.getMonth();
      const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
      const safeDay = Math.min(values.payment_day, lastDayOfMonth);
      
      const paymentDate = new Date(Date.UTC(year, monthIndex, safeDay)).toISOString().split('T')[0];

      const { error: insertError } = await supabase
        .from('direct_debits')
        .insert({
          requester_id: user.id,
          payee: values.payee,
          payment_date: paymentDate,
          sku: values.not_property_related ? null : values.sku,
          not_property_related: values.not_property_related,
          categories: values.categories,
          total_amount: values.total_amount,
          account_number: values.account_number,
          payment_reference: values.payment_reference || null,
          status: values.status,
          country: values.country,
          bank_account: values.country === 'Switzerland' ? values.bank_account : null,
          currency: values.country === 'United Kingdom' ? 'GBP' : (values.country === 'Switzerland' || values.country === 'Ireland' ? values.currency : null),
          payment_day: values.payment_day,
        });

      if (insertError) {
        throw new Error(`Failed to create direct debit: ${insertError.message}`);
      }

      dismissToast(toastId);
      showSuccess("Direct Debit added successfully!");
      form.reset({
        payee: "",
        payment_day: undefined,
        sku: formCountry === 'United Kingdom' ? 'UK' : 'CH',
        not_property_related: false,
        categories: [],
        total_amount: 0,
        account_number: "",
        payment_reference: "",
        status: "active",
        country: formCountry,
        bank_account: undefined,
        currency: formCountry === 'United Kingdom' ? 'GBP' : (formCountry === 'Switzerland' ? 'CHF' : (formCountry === 'Ireland' ? 'EUR' : undefined)),
      });
      onDirectDebitAdded();
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred.");
      console.error("Error adding new direct debit:", error);
    }
  };

  const filteredCategoryOptions = categoryOptions.filter(option =>
    !option.countries || option.countries.includes(formCountry)
  ).map(opt => ({ value: opt.value, label: opt.label }));

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, (errors) => console.error("Form validation failed:", errors))} className="space-y-6">
        <FormField
          control={form.control}
          name="country"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Country</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={userProfile?.role !== 'admin' && isCountryLocked}>
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
                {userProfile?.role !== 'admin' && isCountryLocked ? "Your country is set by your profile and cannot be changed." : "Select the country for this direct debit."}
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

        {(formCountry === 'Switzerland' || formCountry === 'Ireland') ? (
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Currency<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    {Array.from(["UBS - CHF", "UBS - EUR", "UBS - DKK"]).map((account) => (
                      <SelectItem key={account} value={account}>
                        {account}
                      </SelectItem>
                    ))}
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
                <Input placeholder="e.g., 1234567890" {...field} disabled={form.formState.isSubmitting} />
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
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <SelectTrigger id={field.name}>
                  <FormControl>
                    <SelectValue placeholder="Select status" />
                  </FormControl>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                {isAdmin ? "Select the current status of this direct debit." : "New direct debits are 'Active' by default and can only be changed by an administrator."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          <PlusCircle className="mr-2 h-4 w-4" />
          {form.formState.isSubmitting ? "Adding Direct Debit..." : "Add Direct Debit"}
        </Button>
      </form>
    </Form>
  );
};

export default AddDirectDebitForm;