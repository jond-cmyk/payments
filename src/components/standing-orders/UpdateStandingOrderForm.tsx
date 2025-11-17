"use client";

import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form'; // Import useWatch
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { Edit, PlusCircle, MinusCircle, DollarSign, Search } from 'lucide-react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';
import { StandingOrder, PayeeSuggestion } from '@/types/supabase';
import { majorCurrencies } from '@/schemas/paymentRequestSchema';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import DatePicker from '@/components/DatePicker';
import PrefixedInput from '@/components/PrefixedInput';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'; // Import Dialog components
import { Card, CardTitle } from '@/components/ui/card'; // Import Card and CardTitle for suggestions
import { Separator } from '@/components/ui/separator'; // Import Separator
import PropertyAddressField from '@/components/PropertyAddressField';
import { CheckedState } from '@radix-ui/react-checkbox';

// Helper function to format UK account number for display
const formatUkAccountNumber = (raw: string | undefined | null): string => {
  if (raw === undefined || raw === null) return '';
  let value = String(raw).replace(/\D/g, '');
  if (value.length > 8) value = value.substring(0, 8);
  if (value.length > 4) return value.slice(0, 4) + ' ' + value.slice(4);
  return value;
};

// Helper for days of the month
const daysOfMonth = Array.from({ length: 31 }, (_, i) => String(i + 1));

// Zod schema for editing a standing order
const updateStandingOrderFormSchema = z.object({
  payee: z.string().min(1, "Payee is required."),
  payment_date: z.date({
    required_error: "Payment Start Date is required.",
  }),
  payment_end_date: z.date().optional(),
  sku: z.string().optional(),
  not_property_related: z.boolean().default(false),
  categories: z.array(z.object({
    category: z.string().min(1, "Category is required."),
    amount: z.coerce.number().min(0.01, "Amount must be positive."),
  })).min(1, "At least one category with an amount is required."),
  account_name: z.string().min(1, "Account Name is required."),
  account_address: z.string().optional(),
  iban_number: z.string().optional(),
  sort_code: z.string().optional(),
  account_number: z.string().optional(),
  from_day: z.string().min(1, "From Day is required.").refine(val => parseInt(val) >= 1 && parseInt(val) <= 31, "Invalid day."),
  to_day: z.string().min(1, "To Day is required.").refine(val => parseInt(val) >= 1 && parseInt(val) <= 31, "Invalid day."),
  payment_reference: z.string().optional(),
  status: z.enum(['active', 'cancelled', 'paused', 'pending'], {
    required_error: "Status is required.",
  }).default('active'),
  country: z.string().min(1, "Country is required."),
  bank_details_verified: z.boolean().refine(val => val === true, "You must confirm bank details have been verified."),
  total_amount: z.coerce.number(), // REMOVED .min(0.01) to prevent silent validation failure
  payment_day: z.string().optional().nullable(),
  currency: z.string().optional(), // NEW: Add currency field
  bank_account: z.string().optional(), // NEW: Add bank_account field
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
        message: `SKU must be '${skuPrefix}' followed by numbers.` ,
        path: ['sku'],
      });
    }
  }

  // Conditional validation for bank details based on country
  if (data.country === 'United Kingdom') {
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
    if (data.iban_number && data.iban_number.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN Number should not be provided for United Kingdom.",
        path: ['iban_number'],
      });
    }
    if (data.account_address && data.account_address.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Account Address should not be provided for United Kingdom.",
        path: ['account_address'],
      });
    }
  } else {
    if (!data.iban_number || data.iban_number.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN Number is required.",
        path: ['iban_number'],
      });
    }
    if (!data.account_address || data.account_address.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Account Address is required.",
        path: ['account_address'],
      });
    }
    if (data.sort_code && data.sort_code.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sort Code should not be provided for this country.",
        path: ['sort_code'],
      });
    }
    if (data.account_number && data.account_number.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Account Number should not be provided for this country.",
        path: ['account_number'],
      });
    }
  }

  // NEW: Conditional validation for Switzerland-specific fields
  if (data.country === 'Switzerland') {
    if (!data.currency || data.currency.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency is required for Switzerland.",
        path: ['currency'],
      });
    }
    if (!data.bank_account || data.bank_account.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank Account is required for Switzerland.",
        path: ['bank_account'],
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

  // End date must be after start date if provided
  if (data.payment_end_date && data.payment_date) {
    const startDate = new Date(data.payment_date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(data.payment_end_date);
    endDate.setHours(0, 0, 0, 0);

    if (endDate < startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payment End Date must be on or after the Payment Start Date.",
        path: ['payment_end_date'],
      });
    }
  }
});

interface UpdateStandingOrderFormProps {
  standingOrder: StandingOrder;
  onStandingOrderUpdated: () => void;
}

const UpdateStandingOrderForm: React.FC<UpdateStandingOrderFormProps> = ({ standingOrder, onStandingOrderUpdated }) => {
  const { user, userProfile } = useSession();
  const { availableCountries } = useCountry();

  const [payeeSuggestions, setPayeeSuggestions] = useState<PayeeSuggestion[]>([]);
  const [isSuggestionDialogOpen, setIsSuggestionDialogOpen] = useState(false);
  const [isSearchingPayee, setIsSearchingPayee] = useState(false);

  const form = useForm<z.infer<typeof updateStandingOrderFormSchema>>({
    resolver: zodResolver(updateStandingOrderFormSchema),
    defaultValues: {
      payee: standingOrder.payee || "",
      payment_date: new Date(standingOrder.payment_date + 'T00:00:00'),
      payment_end_date: standingOrder.payment_end_date ? new Date(standingOrder.payment_end_date + 'T00:00:00') : undefined,
      sku: standingOrder.sku || (standingOrder.country === 'United Kingdom' ? 'UK' : 'CH'),
      not_property_related: standingOrder.not_property_related,
      categories: standingOrder.categories.length > 0 ? standingOrder.categories : [{ category: "", amount: 0 }],
      total_amount: standingOrder.total_amount,
      account_name: standingOrder.account_name || "",
      account_address: standingOrder.account_address || "",
      iban_number: standingOrder.iban_number || "",
      sort_code: standingOrder.sort_code || "",
      account_number: standingOrder.account_number || "",
      from_day: String(standingOrder.from_day),
      to_day: String(standingOrder.to_day),
      payment_reference: standingOrder.payment_reference || "",
      status: standingOrder.status === 'awaiting_info' ? 'pending' : standingOrder.status,
      country: standingOrder.country,
      bank_details_verified: standingOrder.bank_details_verified,
      payment_day: standingOrder.payment_day ? String(standingOrder.payment_day) : undefined,
      currency: standingOrder.country === 'United Kingdom' ? 'GBP' : standingOrder.currency || undefined,
      bank_account: standingOrder.bank_account || undefined,
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "categories",
  });

  const notPropertyRelated = form.watch("not_property_related");
  const formCountry = form.watch("country");
  const skuValue = form.watch("sku");
  const isAdmin = userProfile?.role === 'admin';
  
  const watchedCategories = useWatch({
    control: form.control,
    name: "categories",
  });

  const totalAmount = useWatch({
    control: form.control,
    name: "total_amount",
  });

  // Calculate total amount whenever categories array changes
  React.useEffect(() => {
    const newTotal = (watchedCategories || []).reduce((sum, item) => {
      const parsedAmount = parseFloat((item as any)?.amount) || 0;
      return sum + parsedAmount;
    }, 0);
    if (form.getValues('total_amount') !== newTotal) {
      form.setValue("total_amount", newTotal, { shouldValidate: true });
    }
  }, [watchedCategories, form]);

  // NEW: Payee Search Logic
  const handlePayeeBlur = async () => {
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
    const currentFormCountry = form.getValues('country');

    form.setValue('payee', suggestion.name, options);
    form.setValue('account_name', suggestion.bank_account_name || '', options);
    form.setValue('bank_details_verified', false, options);
    form.setValue('currency', suggestion.currency || undefined, options);
    form.setValue('bank_account', suggestion.bank_account || undefined, options);

    if (currentFormCountry === 'United Kingdom') {
        let formattedSortCode = suggestion.sort_code || '';
        if (formattedSortCode) {
            let value = formattedSortCode.replace(/\D/g, '');
            if (value.length > 6) value = value.substring(0, 6);
            if (value.length > 4) value = value.slice(0, 2) + '-' + value.slice(2, 4) + '-' + value.slice(4);
            else if (value.length > 2) value = value.slice(0, 2) + '-' + value.slice(2);
            formattedSortCode = value;
        }
        form.setValue('sort_code', formattedSortCode, options);
        
        const cleanAccountNumber = suggestion.account_number ? suggestion.account_number.replace(/\s/g, '') : '';
        form.setValue('account_number', cleanAccountNumber, options);

        form.setValue('account_address', '', options);
        form.setValue('iban_number', '', options);
    } else {
        form.setValue('account_address', suggestion.address || '', options);
        form.setValue('iban_number', suggestion.iban_number || '', options);
        
        form.setValue('sort_code', '', options);
        form.setValue('account_number', '', options);
    }

    setIsSuggestionDialogOpen(false);
  };

  const onInvalid = (errors: any) => {
    console.error("Form validation failed:", errors);
    showError("Form validation failed. Please check the console for details.");
  };

  const onSubmit = async (values: z.infer<typeof updateStandingOrderFormSchema>) => {
    console.log("Form submitted with values:", values);
    const toastId = showLoading("Updating standing order...");

    try {
      if (!user?.id) {
        throw new Error("User not authenticated.");
      }

      // Preserve the month and year from the existing payment_date, but update the day
      const prevDate = standingOrder.payment_date ? new Date(standingOrder.payment_date + 'T00:00:00Z') : new Date(); // Use UTC parsing for prevDate
      const year = prevDate.getUTCFullYear(); // Use UTC year
      const monthIndex = prevDate.getUTCMonth(); // Use UTC month (0-based)
      
      // Calculate last day of month in UTC
      const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
      const safeDay = values.payment_day ? Math.min(parseInt(values.payment_day), lastDayOfMonth) : null;
      
      // FIX: Use Date.UTC to prevent timezone shifting the date
      const paymentDate = values.payment_date.toISOString().split('T')[0];

      // FIX: Use original country if form value is missing (due to disabled field for non-admins)
      const countryForUpdate = (values.country && values.country.trim() !== '') ? values.country : standingOrder.country;

      // Prepare bank details based on country
      const bankDetails = countryForUpdate === 'United Kingdom'
        ? {
            account_address: null,
            iban_number: null,
            sort_code: values.sort_code,
            account_number: values.account_number?.replace(/\s/g, ''),
          }
        : {
            account_address: values.account_address,
            iban_number: values.iban_number,
            sort_code: null,
            account_number: null,
          };

      const { error: updateError } = await supabase
        .from('standing_orders')
        .update({
          payee: values.payee,
          payment_date: paymentDate,
          payment_end_date: values.payment_end_date ? values.payment_end_date.toISOString().split('T')[0] : null, // NEW
          sku: values.not_property_related ? null : values.sku,
          not_property_related: values.not_property_related,
          categories: values.categories,
          total_amount: values.total_amount,
          account_name: values.account_name,
          ...bankDetails,
          from_day: parseInt(values.from_day),
          to_day: parseInt(values.to_day),
          payment_reference: values.payment_reference || null,
          status: values.status,
          country: countryForUpdate,
          bank_details_verified: values.bank_details_verified,
          payment_day: safeDay,
          currency: countryForUpdate === 'United Kingdom' ? 'GBP' : (countryForUpdate === 'Switzerland' || countryForUpdate === 'Ireland' ? values.currency : null),
          bank_account: countryForUpdate === 'Switzerland' ? values.bank_account : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', standingOrder.id);

      if (updateError) {
        throw new Error(`Failed to update standing order: ${updateError.message}`);
      }

      dismissToast(toastId);
      showSuccess("Standing Order updated successfully!");
      onStandingOrderUpdated();
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred.");
      console.error("Error updating standing order:", error);
    }
  };

  // Filter category options based on the selected country in the form
  const filteredCategoryOptions = categoryOptions.filter(option =>
    !option.countries || option.countries.includes(formCountry)
  ).map(opt => ({ value: opt.value, label: opt.label }));

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
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
                  {isAdmin ? "Select the country for this standing order." : "Only administrators can change the country."}
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
                    placeholder="e.g., Rent Co." 
                    {...field}
                    onBlur={(e) => {
                      field.onBlur();
                      handlePayeeBlur();
                    }}
                    disabled={!isAdmin || form.formState.isSubmitting || isSearchingPayee}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Dynamic Categories Section */}
          <Card className="p-4 shadow-sm">
            <CardTitle className="text-lg font-semibold mb-4 flex items-center">
              <DollarSign className="mr-2 h-5 w-5" /> Categories & Amounts<span className="text-red-600 ml-1 text-lg font-bold">*</span>
            </CardTitle>
            <div className="space-y-4">
              {fields.map((item, index) => (
                <div key={item.id} className="flex flex-col sm:flex-row gap-4 items-end">
                  <FormField
                    control={form.control}
                    name={`categories.${index}.category`}
                    render={({ field }) => (
                      <FormItem className="flex-1 w-full">
                        <FormLabel className={index === 0 ? "font-semibold" : "sr-only"}>Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!isAdmin}>
                          <SelectTrigger>
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
                  <FormField
                    control={form.control}
                    name={`categories.${index}.amount`}
                    render={({ field }) => (
                      <FormItem className="flex-1 w-full">
                        <FormLabel className={index === 0 ? "font-semibold" : "sr-only"}>Amount</FormLabel>
                        <FormControl>
                          <Input 
                            type="text"
                            step="0.01" 
                            placeholder="Amount" 
                            {...field}
                            value={field.value === 0 ? "" : String(field.value)}
                            onChange={(e) => {
                              const rawValue = e.target.value.replace(/[^\d.]/g, '');
                              field.onChange(rawValue);
                            }}
                            disabled={!isAdmin} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {fields.length > 1 && (
                    <Button type="button" variant="outline" size="icon" onClick={() => remove(index)} className="flex-shrink-0" disabled={!isAdmin}>
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => append({ category: "", amount: 0 })}
                className="w-full"
                disabled={!isAdmin}
              >
                <PlusCircle className="mr-2 h-4 w-4" /> Add Another Category
              </Button>
              <Separator className="my-4" />
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total Amount:</span>
                <span>{(totalAmount ?? 0).toFixed(2)}</span>
              </div>
              <FormField
                control={form.control}
                name="total_amount"
                render={({ field }) => (
                  <FormItem className="hidden">
                    <FormControl>
                      <Input type="hidden" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Card>

          {formCountry !== 'United Kingdom' ? (
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
          ) : (
            <div className="space-y-2">
              <FormLabel className="font-semibold">Currency</FormLabel>
              <Input value="GBP - British Pound (Fixed)" disabled className="bg-muted/50" />
              <FormDescription>Currency is fixed to GBP for United Kingdom.</FormDescription>
            </div>
          )}

          <FormField
            control={form.control}
            name="payment_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="font-semibold">Payment Start Date<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                <FormControl>
                  <DatePicker
                    date={field.value}
                    setDate={field.onChange}
                    placeholder="Select start date"
                    disabled={!isAdmin}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="payment_end_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="font-semibold">Payment End Date</FormLabel>
                <FormControl>
                  <DatePicker
                    date={field.value}
                    setDate={field.onChange}
                    placeholder="Select end date (optional)"
                    disabled={!isAdmin}
                  />
                </FormControl>
                <FormDescription>
                  Optional: set an end date if the standing order should stop automatically.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="payment_day"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Payment Day</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={!isAdmin}>
                  <SelectTrigger id={field.name}>
                    <FormControl>
                      <SelectValue placeholder="Select payment day" />
                    </FormControl>
                  </SelectTrigger>
                  <SelectContent>
                    {daysOfMonth.map((day) => (
                      <SelectItem key={day} value={day}>
                        Day {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  The day of the month when the payment should be made.
                </FormDescription>
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
                <div className="flex items-center gap-2">
                  <FormControl className="flex-1">
                    <PrefixedInput prefix={formCountry === 'United Kingdom' ? 'UK' : 'CH'} placeholder="e.g., 12345" {...field} disabled={notPropertyRelated || !isAdmin} />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const skuValue = form.getValues('sku');
                      if (skuValue) {
                        const url = `https://portal.kassoehousing.com/admin/kassoe-theme/categories/edit/115?_method=PUT&Filter%5BKassoeThemeProducts__sku%5D=${encodeURIComponent(skuValue)}&Filter%5BKassoeThemeProducts__address%5D=&Filter%5BKassoeThemeProducts__city%5D=&Filter%5BKassoeThemeProducts__zip%5D=&Filter%5BKassoeThemeProducts__created_by%5D=0&Filter%5BKassoeThemeProducts__active%5D=&Filter%5BKassoeThemeProducts__contract_number%5D=&Filter%5BKassoeThemeProducts__sku_dummy%5D=&Filter%5BKassoeThemeProducts__address_dummy%5D=&Filter%5BKassoeThemeProducts__sku_dummy2%5D=&Filter%5BKassoeThemeProducts__address_dummy2%5D=&Filter%5BKassoeThemeProducts__created_by%5D=0&Filter%5Bcustom__is_booked%5D=0`;
                        window.open(url, '_blank');
                      } else {
                        showError("Please enter an SKU number first.");
                      }
                    }}
                    disabled={notPropertyRelated || !isAdmin}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Check Accommodation in Platform</span>
                </div>
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
                    disabled={!isAdmin}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>
                    Not Property Related
                  </FormLabel>
                  <FormDescription>
                    Check this box if this standing order is not associated with a property SKU.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="account_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Account Name<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="e.g., John Doe" {...field} disabled={!isAdmin} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {formCountry === 'United Kingdom' ? (
            <>
              <FormField
                control={form.control}
                name="sort_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Sort Code<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
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
                        disabled={!isAdmin}
                      />
                    </FormControl>
                    <FormDescription>
                      Enter the 6-digit Sort Code in XX-XX-XX format.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="account_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Bank Account Number<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., 1234 5678"
                        {...field}
                        value={formatUkAccountNumber(field.value)}
                        onChange={(e) => {
                          let value = e.target.value.replace(/\D/g, '');
                          if (value.length > 8) value = value.substring(0, 8);
                          field.onChange(value);
                        }}
                        disabled={!isAdmin}
                      />
                    </FormControl>
                    <FormDescription>
                      Enter the 8-digit Bank Account Number.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          ) : (
            <>
              <FormField
                control={form.control}
                name="account_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Account Address<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <FormControl>
                      <Textarea placeholder="e.g., 123 Bank St, City, Country" {...field} disabled={!isAdmin} />
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
                    <FormLabel className="font-semibold">IBAN Number<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., CH9300762011623852957" {...field} disabled={!isAdmin} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
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
            name="bank_details_verified"
            render={({ field }) => (
              <FormItem>
                <div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-blue-50 border-blue-200">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={!isAdmin}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-blue-700">
                      I have verified these bank details with the payee.<span className="text-red-600 ml-1 text-lg font-bold">*</span>
                    </FormLabel>
                    <FormDescription className="text-blue-600">
                      Please ensure the bank details are correct to avoid payment delays or errors.
                    </FormDescription>
                  </div>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="from_day"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Accruals Period From Day<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!isAdmin}>
                    <SelectTrigger id={field.name}>
                      <FormControl>
                        <SelectValue placeholder="Select day" />
                      </FormControl>
                    </SelectTrigger>
                    <SelectContent>
                      {daysOfMonth.map((day) => (
                        <SelectItem key={day} value={day}>
                          {day}
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
              name="to_day"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Accruals Period To Day<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!isAdmin}>
                    <SelectTrigger id={field.name}>
                      <FormControl>
                        <SelectValue placeholder="Select day" />
                      </FormControl>
                    </SelectTrigger>
                    <SelectContent>
                      {daysOfMonth.map((day) => (
                        <SelectItem key={day} value={day}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="payment_reference"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Payment Reference</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., SO-RENT-001" {...field} disabled={!isAdmin} />
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
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {isAdmin ? "Select the current status of this standing order." : "Only administrators can change the status."}
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
            <DialogDescription>
              We found existing payees with a similar name. You can use their details to pre-fill the form.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {payeeSuggestions.length > 0 ? (
              payeeSuggestions.map((suggestion, index) => (
                <Card key={index} className="p-4 border shadow-sm">
                  <h3 className="font-bold text-lg mb-2">{suggestion.name}</h3>
                  <p className="text-sm text-muted-foreground">Source: {suggestion.source_type === 'payment_request' ? 'Payment Request' : 'Standing Order'}</p>
                  <p className="text-sm text-muted-foreground">Account Name: {suggestion.bank_account_name || 'N/A'}</p>
                  <p className="text-sm text-muted-foreground">Currency: {suggestion.currency || 'N/A'}</p>
                  {suggestion.country === 'United Kingdom' ? (
                    <>
                      <p className="text-sm text-muted-foreground">Sort Code: {suggestion.sort_code || 'N/A'}</p>
                      <p className="text-sm text-muted-foreground">Bank Account Number: {suggestion.account_number ? suggestion.account_number.replace(/(\d{4})(\d{4})/, '$1 $2') : 'N/A'}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">IBAN: {suggestion.iban_number || 'N/A'}</p>
                      <p className="text-sm text-muted-foreground">Address: {suggestion.address || 'N/A'}</p>
                      {suggestion.country === 'Switzerland' && <p className="text-sm text-muted-foreground">Bank Account: {suggestion.bank_account || 'N/A'}</p>}
                    </>
                  )}
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

export default UpdateStandingOrderForm;