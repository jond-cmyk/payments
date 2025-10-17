"use client";

import React, { useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form'; // Import useWatch
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { PlusCircle, MinusCircle, DollarSign } from 'lucide-react'; // Import DollarSign
import { useSession } from '@/integrations/supabase/SessionContext';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';
import { StandingOrder } from '@/types/supabase'; // Import StandingOrder type for suggestions

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import DatePicker from '@/components/DatePicker';
import PrefixedInput from '@/components/PrefixedInput';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'; // Import Dialog components
import { Card, CardTitle } from '@/components/ui/card'; // Import Card and CardTitle for suggestions
import { Separator } from '@/components/ui/separator'; // Import Separator

// Helper for days of the month
const daysOfMonth = Array.from({ length: 31 }, (_, i) => String(i + 1));

// Zod schema for adding a new standing order
const addStandingOrderFormSchema = z.object({
  payee: z.string().min(1, "Payee is required."),
  payment_date: z.date({
    required_error: "Payment Start Date is required.",
  }),
  payment_end_date: z.date().optional(), // NEW
  sku: z.string().optional(),
  not_property_related: z.boolean().default(false),
  categories: z.array(z.object({
    category: z.string().min(1, "Category is required."),
    amount: z.coerce.number().min(0.01, "Amount must be positive."),
  })).min(1, "At least one category with an amount is required."), // Ensure at least one category
  account_name: z.string().min(1, "Account Name is required."),
  account_address: z.string().optional(),
  iban_number: z.string().optional(),
  sort_code: z.string().optional(),
  account_number: z.string().optional(),
  from_day: z.string().min(1, "From Day is required.").refine(val => parseInt(val) >= 1 && parseInt(val) <= 31, "Invalid day."),
  to_day: z.string().min(1, "To Day is required.").refine(val => parseInt(val) >= 1 && parseInt(val) <= 31, "Invalid day."),
  payment_reference: z.string().optional(),
  comments: z.string().optional(), // NEW
  status: z.enum(['active', 'cancelled', 'paused', 'pending', 'awaiting_info'], { // Added 'awaiting_info' status
    required_error: "Status is required.",
  }).default('awaiting_info'), // Default to 'awaiting_info'
  country: z.string().min(1, "Country is required."),
  bank_details_verified: z.boolean().refine(val => val === true, "You must confirm bank details have been verified."),
  total_amount: z.coerce.number().min(0.01, "Total amount must be positive."), // Added total_amount to schema
  payment_day: z.string().optional(), // Add payment_day to schema
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
        message: "Account Number is required and must be 8 digits.",
        path: ['account_number'],
      });
    }
    // Ensure IBAN and Account Address are not provided for UK
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
    // Ensure UK bank details are not provided for non-UK countries
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

  // Accruals period validation - REMOVED
  // if (parseInt(data.from_day) > parseInt(data.to_day)) {
  //   ctx.addIssue({
  //     code: z.ZodIssueCode.custom,
  //     message: "'From Day' cannot be after 'To Day'.",
  //     path: ['from_day'],
  //   });
  // }

  // NEW: End date must be after start date if provided
  if (data.payment_end_date && data.payment_end_date < data.payment_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Payment End Date must be after the Payment Start Date.",
      path: ['payment_end_date'],
    });
  }
});

interface AddStandingOrderFormProps {
  onStandingOrderAdded: () => void;
}

const AddStandingOrderForm: React.FC<AddStandingOrderFormProps> = ({ onStandingOrderAdded }) => {
  const { user, userProfile } = useSession();
  const { currentCountry, availableCountries, isCountryLocked } = useCountry();

  const [payeeSuggestions, setPayeeSuggestions] = useState<StandingOrder[]>([]);
  const [isSuggestionDialogOpen, setIsSuggestionDialogOpen] = useState(false);
  const [isSearchingPayee, setIsSearchingPayee] = useState(false);

  const form = useForm<z.infer<typeof addStandingOrderFormSchema>>({
    resolver: zodResolver(addStandingOrderFormSchema),
    defaultValues: {
      payee: "",
      payment_date: undefined,
      payment_end_date: undefined, // NEW
      sku: currentCountry === 'United Kingdom' ? 'UK' : 'CH',
      not_property_related: false,
      categories: [{ category: "", amount: 0 }], // Initialize with one mandatory category
      account_name: "",
      account_address: "",
      iban_number: "",
      sort_code: "",
      account_number: "",
      from_day: "1", // Default to 1st day
      to_day: "31", // Default to 31st day
      payment_reference: "",
      comments: "", // NEW
      status: "awaiting_info", // Default to 'awaiting_info'
      country: currentCountry === 'all' ? 'Switzerland' : currentCountry, // Default to Switzerland if 'all' is selected
      bank_details_verified: false,
      total_amount: 0, // Initialize total amount
      payment_day: undefined, // Add payment_day to default values
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "categories",
  });

  const notPropertyRelated = form.watch("not_property_related");
  const formCountry = form.watch("country");
  const isAdmin = userProfile?.role === 'admin';
  
  // Watch the entire categories array for changes
  const watchedCategories = useWatch({
    control: form.control,
    name: "categories",
    defaultValue: form.getValues("categories"), // Ensure initial value is set
  });

  // Calculate total amount whenever categories array changes
  React.useEffect(() => {
    console.log("[AddStandingOrderForm] useEffect triggered for watchedCategories change.");
    console.log("[AddStandingOrderForm] watchedCategories:", JSON.stringify(watchedCategories));
    const newTotal = (watchedCategories || []).reduce((sum, categoryItem) => {
      const parsedAmount = parseFloat(categoryItem?.amount as any) || 0; // Ensure it's a number
      console.log(`[AddStandingOrderForm] Reducing item: sum=${sum}, amount=${parsedAmount}`);
      return sum + parsedAmount;
    }, 0);
    console.log("[AddStandingOrderForm] Calculated newTotal:", newTotal);
    form.setValue("total_amount", newTotal, { shouldValidate: true }); // Also validate on change
  }, [watchedCategories, form]); // Dependency on watchedCategories

  // Effect to reset form defaults if currentCountry changes
  React.useEffect(() => {
    const newSkuPrefix = currentCountry === 'United Kingdom' ? 'UK' : 'CH';
    form.reset((prev) => ({
      ...prev,
      sku: newSkuPrefix,
      country: currentCountry === 'all' ? 'Switzerland' : currentCountry,
      account_address: "",
      iban_number: "",
      sort_code: "",
      account_number: "",
      bank_details_verified: false,
      categories: [{ category: "", amount: 0 }], // Reset categories
      total_amount: 0, // Reset total amount
    }));
  }, [currentCountry, form]);

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
      const { data, error } = await supabase.functions.invoke('search-payees', {
        body: { searchTerm: payeeName, country: currentFormCountry },
      });

      if (error) {
        throw new Error(error.message);
      }
      if (data?.error) {
        throw new Error(data.error);
      }

      if (data && data.suggestions && data.suggestions.length > 0) {
        setPayeeSuggestions(data.suggestions);
        setIsSuggestionDialogOpen(true);
        dismissToast(toastId);
        showSuccess("Found existing payee suggestions!");
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

  const handleUseSuggestion = (suggestion: StandingOrder) => {
    form.setValue('payee', suggestion.payee);
    form.setValue('account_name', suggestion.account_name);
    form.setValue('account_address', suggestion.account_address || '');
    form.setValue('iban_number', suggestion.iban_number || '');
    form.setValue('sort_code', suggestion.sort_code || '');
    form.setValue('account_number', suggestion.account_number || '');
    form.setValue('bank_details_verified', false); // Reset verified status when using suggestion
    form.setValue('categories', suggestion.categories); // Set categories from suggestion
    form.setValue('total_amount', suggestion.total_amount); // Set total amount from suggestion
    // Close the dialog
    setIsSuggestionDialogOpen(false);
  };

  const onSubmit = async (values: z.infer<typeof addStandingOrderFormSchema>) => {
    const toastId = showLoading("Adding new standing order...");

    try {
      if (!user?.id) {
        throw new Error("User not authenticated.");
      }

      // Prepare bank details based on country
      const bankDetails = values.country === 'United Kingdom'
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

      const { error: insertError } = await supabase
        .from('standing_orders')
        .insert({
          requester_id: user.id,
          payee: values.payee,
          payment_date: values.payment_date.toISOString().split('T')[0],
          payment_end_date: values.payment_end_date ? values.payment_end_date.toISOString().split('T')[0] : null, // NEW
          sku: values.not_property_related ? null : values.sku,
          not_property_related: values.not_property_related,
          categories: values.categories, // Use the new categories array
          total_amount: values.total_amount, // Use the new total_amount
          account_name: values.account_name,
          ...bankDetails,
          from_day: parseInt(values.from_day),
          to_day: parseInt(values.to_day),
          payment_reference: values.payment_reference || null,
          comments: values.comments || null, // NEW
          status: values.status,
          country: values.country,
          bank_details_verified: values.bank_details_verified,
          payment_day: values.payment_day ? parseInt(values.payment_day) : null, // Add payment_day to insert
        });

      if (insertError) {
        throw new Error(`Failed to create standing order: ${insertError.message}`);
      }

      dismissToast(toastId);
      showSuccess("Standing Order added successfully!");
      form.reset({
        payee: "",
        payment_date: undefined,
        payment_end_date: undefined, // NEW
        sku: formCountry === 'United Kingdom' ? 'UK' : 'CH',
        not_property_related: false,
        categories: [{ category: "", amount: 0 }], // Reset categories
        total_amount: 0, // Reset total amount
        account_name: "",
        account_address: "",
        iban_number: "",
        sort_code: "",
        account_number: "",
        from_day: "1",
        to_day: "31",
        payment_reference: "",
        comments: "", // NEW
        status: "awaiting_info",
        country: formCountry,
        bank_details_verified: false,
        payment_day: undefined, // Reset payment_day
      });
      onStandingOrderAdded();
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred.");
      console.error("Error adding new standing order:", error);
    }
  };

  // Filter category options based on the selected country in the form
  const filteredCategoryOptions = categoryOptions.filter(option =>
    !option.countries || option.countries.includes(formCountry)
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                {userProfile?.role !== 'admin' && isCountryLocked ? "Your country is set by your profile and cannot be changed." : "Select the country for this standing order."}
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
                  disabled={form.formState.isSubmitting || isSearchingPayee}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger id={field.name}>
                  <FormControl>
                    <SelectValue placeholder="Select payment day" />
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
              <FormControl>
                <PrefixedInput prefix={formCountry === 'United Kingdom' ? 'UK' : 'CH'} placeholder="e.g., 12345" {...field} disabled={notPropertyRelated} />
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
                      <Select onValueChange={field.onChange} value={field.value}>
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
                        <Input type="number" step="0.01" placeholder="Amount" {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value))} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {fields.length > 1 && (
                  <Button type="button" variant="outline" size="icon" onClick={() => remove(index)} className="flex-shrink-0">
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
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add Another Category
            </Button>
            <Separator className="my-4" />
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Total Amount:</span>
              <span>{form.getValues('total_amount').toFixed(2)}</span>
            </div>
            <FormField
              control={form.control}
              name="total_amount"
              render={({ field }) => (
                <FormItem className="hidden"> {/* Hidden field for Zod validation */}
                  <FormControl>
                    <Input type="hidden" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </Card>

        <FormField
          control={form.control}
          name="account_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Account Name<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
              <FormControl>
                <Input placeholder="e.g., John Doe" {...field} />
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
                  <FormLabel className="font-semibold">Account Number<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 1234 5678"
                      {...field}
                      onChange={(e) => {
                        let value = e.target.value.replace(/\D/g, '');
                        if (value.length > 8) value = value.substring(0, 8);
                        if (value.length > 4) value = value.slice(0, 4) + ' ' + value.slice(4);
                        field.onChange(value);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the 8-digit Account Number.
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
                  <FormLabel className="font-semibold">IBAN Number<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., CH9300762011623852957" {...field} />
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
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-blue-50 border-blue-200">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
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
                <Select onValueChange={field.onChange} value={field.value}>
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
                <Select onValueChange={field.onChange} value={field.value}>
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
                <Input placeholder="e.g., SO-RENT-001" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="comments"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Comments</FormLabel>
              <FormControl>
                <Textarea placeholder="Add any notes or context for this standing order" {...field} />
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
                {isAdmin ? "Select the current status of this standing order." : "New standing orders are 'Awaiting Info' by default and can only be changed by an administrator."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          <PlusCircle className="mr-2 h-4 w-4" />
          {form.formState.isSubmitting ? "Adding Standing Order..." : "Add Standing Order"}
        </Button>
      </form>

      {/* Payee Suggestions Dialog */}
      <Dialog open={isSuggestionDialogOpen} onOpenChange={setIsSuggestionDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Existing Payee Suggestions</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {payeeSuggestions.length > 0 ? (
              payeeSuggestions.map((suggestion, index) => (
                <Card key={index} className="p-4 border shadow-sm">
                  <h3 className="font-bold text-lg mb-2">{suggestion.payee}</h3>
                  <p className="text-sm text-muted-foreground">Account Name: {suggestion.account_name}</p>
                  {suggestion.country === 'United Kingdom' ? (
                    <>
                      <p className="text-sm text-muted-foreground">Sort Code: {suggestion.sort_code || 'N/A'}</p>
                      <p className="text-sm text-muted-foreground">Account Number: {suggestion.account_number ? suggestion.account_number.replace(/(\d{4})(\d{4})/, '$1 $2') : 'N/A'}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">IBAN: {suggestion.iban_number || 'N/A'}</p>
                      <p className="text-sm text-muted-foreground">Address: {suggestion.account_address || 'N/A'}</p>
                      {suggestion.country === 'Switzerland' && (
                        <>
                          <p className="text-sm text-muted-foreground">Currency: {suggestion.currency || 'N/A'}</p>
                          <p className="text-sm text-muted-foreground">Bank Account: {suggestion.bank_account || 'N/A'}</p>
                        </>
                      )}
                    </>
                  )}
                  <div className="mt-2">
                    <p className="text-sm font-medium">Categories:</p>
                    {suggestion.categories.map((cat, catIndex) => (
                      <p key={catIndex} className="text-xs text-muted-foreground ml-2">
                        - {categoryOptions.find(opt => opt.value === cat.category)?.label || cat.category}: {cat.amount.toFixed(2)}
                      </p>
                    ))}
                    <p className="text-sm font-bold mt-1">Total: {suggestion.total_amount.toFixed(2)}</p>
                  </div>
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
        </DialogContent>
      </Dialog>
    </Form>
  );
};

export default AddStandingOrderForm;