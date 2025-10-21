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
import DatePicker from '@/components/DatePicker';
import PrefixedInput from '@/components/PrefixedInput';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardTitle } from '@/components/ui/card';

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
  category: z.string().min(1, "Category is required."),
  account_number: z.string().min(1, "Account Number is required."),
  payment_reference: z.string().optional(), // Made optional
  status: z.enum(['active', 'cancelled', 'paused', 'pending', 'awaiting_info'], { // Added 'awaiting_info' status
    required_error: "Status is required.",
  }).default('active'),
  country: z.string().min(1, "Country is required."),
  bank_account: z.string().optional(),
  currency: z.string().optional(), // NEW: Currency field
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
    if (!data.currency || data.currency.trim() === '') { // Currency required for CH
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency is required for Switzerland.",
        path: ['currency'],
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

  const [payeeSuggestions, setPayeeSuggestions] = useState<PayeeSuggestion[]>([]);
  const [isSuggestionDialogOpen, setIsSuggestionDialogOpen] = useState(false);
  const [isSearchingPayee, setIsSearchingPayee] = useState(false);

  const form = useForm<z.infer<typeof editDirectDebitFormSchema>>({
    resolver: zodResolver(editDirectDebitFormSchema),
    defaultValues: {
      payee: directDebit.payee,
      payment_day: directDebit.payment_day !== null && directDebit.payment_day !== undefined ? directDebit.payment_day : undefined,
      sku: directDebit.sku || (directDebit.country === 'United Kingdom' ? 'UK' : 'CH'),
      not_property_related: directDebit.not_property_related,
      category: directDebit.category,
      account_number: directDebit.account_number,
      payment_reference: directDebit.payment_reference || "", // Ensure default is empty string for optional field
      status: directDebit.status,
      country: directDebit.country,
      bank_account: directDebit.bank_account || undefined,
      currency: directDebit.currency || undefined, // NEW: Set currency default
    },
  });

  const notPropertyRelated = form.watch("not_property_related");
  const formCountry = form.watch("country");
  const isAdmin = userProfile?.role === 'admin';

  // NEW: Payee Search Logic
  const handlePayeeBlur = async () => {
    if (!isAdmin) return; // Only admins can trigger search on edit form

    const payeeName = form.getValues('payee');
    const currentFormCountry = form.getValues('country');

    if (!payeeName || payeeName.trim() === '') {
      setPayeeSuggestions([]);
      setIsSuggestionDialogOpen(false);
      return;
    }

    setIsSearchingPayee(true);
    const toastId = showLoading("Searching for existing payees...");

    try {
      const { data, error } = await supabase.functions.invoke('search-all-payees', {
        body: { searchTerm: payeeName, country: currentFormCountry },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (data && data.suggestions && data.suggestions.length > 0) {
        setPayeeSuggestions(data.suggestions);
        setIsSuggestionDialogOpen(true);
        dismissToast(toastId);
        showSuccess(`Found ${data.suggestions.length} existing payee suggestion(s)!`);
      } else {
        setPayeeSuggestions([]);
        setIsSuggestionDialogOpen(false);
        dismissToast(toastId);
        showSuccess("No existing payee found with similar name. Please enter details manually.");
      }
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to search for existing payees.");
      console.error("Payee search error:", error);
      setPayeeSuggestions([]);
      setIsSuggestionDialogOpen(false);
    } finally {
      setIsSearchingPayee(false);
    }
  };

  const handleUseSuggestion = (suggestion: PayeeSuggestion) => {
    const options = { shouldValidate: true, shouldDirty: true };
    form.setValue('payee', suggestion.name, options);
    form.setValue('account_number', suggestion.account_number || '', options);
    form.setValue('payment_reference', suggestion.payment_reference || '', options);
    form.setValue('currency', suggestion.currency || undefined, options);
    form.setValue('bank_account', suggestion.bank_account || undefined, options);
    
    // Note: Direct Debits don't have categories/total_amount fields to reset.
    
    setIsSuggestionDialogOpen(false);
  };

  const onSubmit = async (values: z.infer<typeof editDirectDebitFormSchema>) => {
    const toastId = showLoading("Updating direct debit...");

    try {
      if (!user?.id) {
        throw new Error("User not authenticated.");
      }

      // Preserve the month and year from the existing payment_date, but update the day
      const prevDate = directDebit.payment_date ? new Date(directDebit.payment_date + 'T00:00:00Z') : new Date(); // Use UTC parsing for prevDate
      const year = prevDate.getUTCFullYear(); // Use UTC year
      const monthIndex = prevDate.getUTCMonth(); // Use UTC month (0-based)
      
      // Calculate last day of month in UTC
      const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
      const safeDay = values.payment_day ? Math.min(values.payment_day, lastDayOfMonth) : null;
      
      // FIX: Use Date.UTC to prevent timezone shifting the date
      const paymentDate = new Date(Date.UTC(year, monthIndex, safeDay || 1)).toISOString().split('T')[0]; // Use safeDay or 1 if null

      const { error: updateError } = await supabase
        .from('direct_debits')
        .update({
          payee: values.payee,
          payment_date: paymentDate, // Store the UTC-safe date
          sku: values.not_property_related ? null : values.sku,
          not_property_related: values.not_property_related,
          category: values.category,
          account_number: values.account_number,
          payment_reference: values.payment_reference || null, // Store null if empty string
          status: values.status,
          country: values.country,
          bank_account: values.country === 'Switzerland' ? values.bank_account : null,
          currency: values.country === 'Switzerland' ? values.currency : null, // NEW: Conditionally save currency
          updated_at: new Date().toISOString(),
          payment_day: values.payment_day, // Store the payment_day directly
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

  // Filter category options based on the selected country in the form
  const filteredCategoryOptions = categoryOptions.filter(option =>
    !option.countries || option.countries.includes(formCountry)
  );

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
                  <Input 
                    placeholder="e.g., Electricity Company" 
                    {...field} 
                    disabled={!isAdmin || form.formState.isSubmitting || isSearchingPayee}
                    onBlur={(e) => {
                      field.onBlur();
                      handlePayeeBlur(); // Call our custom blur handler
                    }}
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
                    disabled={!isAdmin}
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
                  <PrefixedInput prefix={formCountry === 'United Kingdom' ? 'UK' : 'CH'} placeholder="e.g., 12345" {...field} disabled={notPropertyRelated || !isAdmin} />
                </FormControl>
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
                  <SelectTrigger id={field.name}>
                    <FormControl>
                      <SelectValue placeholder="Select a category" />
                    </FormControl>
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCategoryOptions.map((option) => (
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
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Currency<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!isAdmin}>
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
          )}
          {formCountry === 'Switzerland' && (
            <FormField
              control={form.control}
              name="bank_account"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Bank Account<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!isAdmin}>
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
                <FormLabel className="font-semibold">Payment Reference</FormLabel>
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
                  <SelectTrigger id={field.name}>
                    <FormControl>
                      <SelectValue placeholder="Select status" />
                    </FormControl>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="awaiting_info">Awaiting Info</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
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
          
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || !isAdmin}>
            <Edit className="mr-2 h-4 w-4" />
            {form.formState.isSubmitting ? "Saving Changes..." : "Save Changes"}
          </Button>
        </form>
      </Form>
      {/* NEW: Payee Suggestions Dialog */}
      <Dialog open={isSuggestionDialogOpen} onOpenChange={setIsSuggestionDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-bold">Existing Payee Suggestions</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {payeeSuggestions.length > 0 ? (
              payeeSuggestions.map((suggestion, index) => (
                <Card key={index} className="p-4 border shadow-sm">
                  <h3 className="font-bold text-lg mb-2">{suggestion.name}</h3>
                  <p className="text-sm text-muted-foreground">Source: {suggestion.source_type === 'payment_request' ? 'Payment Request' : suggestion.source_type === 'standing_order' ? 'Standing Order' : 'Direct Debit'}</p>
                  <p className="text-sm text-muted-foreground">Currency: {suggestion.currency || 'N/A'}</p>
                  <p className="text-sm text-muted-foreground">Account Number: {suggestion.account_number || 'N/A'}</p>
                  {suggestion.country === 'Switzerland' && <p className="text-sm text-muted-foreground">Bank Account: {suggestion.bank_account || 'N/A'}</p>}
                  <Button
                    onClick={() => handleUseSuggestion(suggestion)}
                    className="mt-4 w-full bg-dyad-blue hover:bg-dyad-blue-light text-dyad-blue-foreground"
                  >
                    Use This Information
                  </Button>
                </Card>
              ))
            ) : (
              <p className="text-center text-muted-foreground">No suggestions found.</p>
            )}
          </div>
          <Button
            variant="destructive"
            onClick={() => setIsSuggestionDialogOpen(false)}
            className="mt-4 w-full"
          >
            Enter New Details
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EditDirectDebitForm;