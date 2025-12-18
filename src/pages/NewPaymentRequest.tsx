"use client";

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';
import { PayeeSuggestion, StandingOrder } from '@/types/supabase';
import { majorCurrencies } from '@/schemas/paymentRequestSchema';
import { PlusCircle, MinusCircle, DollarSign, Search, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import DatePicker from '@/components/DatePicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PrefixedInput from '@/components/PrefixedInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import FileInput from '@/components/FileInput';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import PropertyAddressField from '@/components/PropertyAddressField';
import { formatAmount } from '@/components/economic/EconomicDetailDialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

// Define the Zod schema for form validation
const formSchema = z.object({
  supplier_name: z.string().min(1, "Supplier Name is required"),
  sku_number: z.string().optional(),
  not_sku_related: z.boolean().default(false),
  lease_id: z.string().optional().refine((val) => {
    if (val === undefined || val === null || val.trim() === '') return true;
    return /^\d+$/.test(val);
  }, "Lease ID must be a numerical value."),
  supplier_address: z.string().min(1, "Supplier Address is required"),
  iban_number: z.string().optional(),
  sort_code: z.string().optional(),
  account_number: z.string().optional(),
  bank_account_name: z.string().optional(),
  currency: z.string().min(1, "Currency is required"),
  total_amount: z.coerce.number(),
  notes: z.string().optional(),
  date_payment_required: z.date({
    required_error: "Date Payment Required is required",
  }),
  invoice_pdf: z.any()
    .refine((files) => files?.length > 0, "At least one Invoice document is required.")
    .refine((files) => Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024), "Max file size is 5MB per file.")
    .refine((files) => Array.from(files as FileList).every(file => file.type === "application/pdf" || file.type === "image/jpeg" || file.type === "image/png"), "Only .pdf, .jpg, .jpeg, .png files are accepted."),
  receipt_required: z.boolean().default(false),
  is_urgent: z.boolean().default(false),
  country: z.string().min(1, "Country is required"),
  categories: z.array(z.object({
    category: z.string().min(1, "Category is required."),
    amount: z.coerce.number().min(0.01, "Amount must be positive."),
  })).min(1, "At least one category with an amount is required."),
  bank_details_verified: z.boolean().refine(val => val === true, "You must confirm bank details have been verified."),
}).superRefine((data, ctx) => {
  const skuPrefix = data.country === 'United Kingdom' ? 'UK' : 'CH';

  if (!data.not_sku_related) {
    if (!data.sku_number || data.sku_number.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU Number is required unless 'Not SKU Related' is checked.`,
        path: ['sku_number'],
      });
    } else if (!data.sku_number.startsWith(skuPrefix)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU Number must start with '${skuPrefix}'.`,
        path: ['sku_number'],
      });
    } else if (!new RegExp(`^${skuPrefix}\\d+$`).test(data.sku_number)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SKU Number must be '${skuPrefix}' followed by numbers.`,
        path: ['sku_number'],
      });
    }
  }

  if (data.country === 'United Kingdom') {
    if (data.currency !== 'GBP') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency must be GBP for United Kingdom.",
        path: ['currency'],
      });
    }
  } else if (data.country === 'Switzerland') {
    if (!data.currency || data.currency.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency is required for Switzerland.",
        path: ['currency'],
      });
    }
  }

  if (data.country === 'United Kingdom') {
    if (!data.sort_code || !/^\d{2}-\d{2}-\d{2}$/.test(data.sort_code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sort Code is required and must be in XX-XX-XX format.",
        path: ['sort_code'],
      });
    }
    if (!data.account_number || !/^\d{8}$/.test(data.account_number?.replace(/\s/g, '') || '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank Account Number is required and must be 8 digits.",
        path: ['account_number'],
      });
    }
    if (!data.bank_account_name || data.bank_account_name.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank Account Name is required.",
        path: ['bank_account_name'],
      });
    }
    if (data.iban_number && data.iban_number.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN Number should not be provided for United Kingdom.",
        path: ['iban_number'],
      });
    }
  } else if (data.country === 'Switzerland') {
    if (!data.iban_number || data.iban_number.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN Number is required.",
        path: ['iban_number'],
      });
    }
    if (!data.bank_account_name || data.bank_account_name.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank Account Name is required for Switzerland.",
        path: ['bank_account_name'],
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
  }
});

const NewPaymentRequest = () => {
  const { session, isLoading, user, userProfile } = useSession();
  const { currentCountry, availableCountries, isCountryLocked } = useCountry();
  const navigate = useNavigate();

  const [supplierSuggestions, setSupplierSuggestions] = useState<PayeeSuggestion[]>([]);
  const [isSuggestionDialogOpen, setIsSuggestionDialogOpen] = useState(false);
  const [isSearchingSupplier, setIsSearchingSupplier] = useState(false);

  const [isDuplicateWarningOpen, setIsDuplicateWarningOpen] = useState(false);
  const [duplicateStandingOrderData, setDuplicateStandingOrderData] = useState<StandingOrder | null>(null);
  const [pendingSubmissionValues, setPendingSubmissionValues] = useState<z.infer<typeof formSchema> | null>(null);

  const defaultSkuPrefix = currentCountry === 'United Kingdom' ? 'UK' : 'CH';
  const initialCurrency = currentCountry === 'United Kingdom' ? 'GBP' : 'CHF';

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplier_name: "",
      sku_number: defaultSkuPrefix,
      not_sku_related: false,
      lease_id: "",
      supplier_address: "",
      iban_number: "",
      sort_code: "",
      account_number: "",
      bank_account_name: "",
      currency: initialCurrency,
      total_amount: 0.00,
      notes: "",
      date_payment_required: undefined,
      invoice_pdf: undefined,
      receipt_required: false,
      is_urgent: false,
      country: currentCountry,
      categories: [{ category: "", amount: 0 }],
      bank_details_verified: false,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "categories",
  });

  const notSkuRelated = form.watch("not_sku_related");
  const formCountry = form.watch("country");
  const skuValue = form.watch("sku_number");
  const watchedCategories = useWatch({
    control: form.control,
    name: "categories",
  });

  React.useEffect(() => {
    const newTotal = (watchedCategories || []).reduce((sum, categoryItem) => {
      const parsedAmount = parseFloat(categoryItem?.amount as any) || 0;
      return sum + parsedAmount;
    }, 0);
    if (form.getValues('total_amount') !== newTotal) {
      form.setValue("total_amount", newTotal, { shouldValidate: true });
    }
  }, [watchedCategories, form]);

  React.useEffect(() => {
    const newSkuPrefix = formCountry === 'United Kingdom' ? 'UK' : 'CH';
    const newCurrency = formCountry === 'United Kingdom' ? 'GBP' : 'CHF';

    form.reset((prev) => ({
      ...prev,
      sku_number: newSkuPrefix,
      currency: newCurrency,
      iban_number: "",
      sort_code: "",
      account_number: "",
      bank_account_name: "",
      country: formCountry,
      categories: [{ category: "", amount: 0 }],
      total_amount: 0,
      bank_details_verified: false,
    }));
  }, [formCountry, form]);


  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  const handleSupplierNameBlur = async () => {
    const supplierName = form.getValues('supplier_name');
    const currentFormCountry = form.getValues('country');

    if (!supplierName || supplierName.trim() === '') {
      setSupplierSuggestions([]);
      setIsSuggestionDialogOpen(false);
      return;
    }

    setIsSearchingSupplier(true);
    const toastId = showLoading("Searching for existing payees...");

    try {
      const { data, error } = await supabase.functions.invoke('search-all-payees', {
        body: { searchTerm: supplierName, country: currentFormCountry },
      });

      if (error) {
        throw new Error(error.message);
      }
      if (data?.error) {
        throw new Error(data.error);
      }

      if (data && data.suggestions && data.suggestions.length > 0) {
        setSupplierSuggestions(data.suggestions);
        setIsSuggestionDialogOpen(true);
        dismissToast(toastId);
        showSuccess(`Found ${data.suggestions.length} existing payee suggestion(s)!`);
      } else {
        setSupplierSuggestions([]);
        setIsSuggestionDialogOpen(false);
        dismissToast(toastId);
        showSuccess("No existing payee found with similar name. Please enter details manually.");
      }
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to search for existing payees.");
      console.error("Payee search error:", error);
      setSupplierSuggestions([]);
      setIsSuggestionDialogOpen(false);
    } finally {
      setIsSearchingSupplier(false);
    }
  };

  const handleUseSuggestion = (suggestion: PayeeSuggestion) => {
    const options = { shouldValidate: true, shouldDirty: true };
    const currentFormCountry = form.getValues('country');

    form.setValue('supplier_name', suggestion.name, options);
    form.setValue('bank_details_verified', false, options);
    form.setValue('currency', suggestion.currency || (currentFormCountry === 'United Kingdom' ? 'GBP' : 'CHF'), options);

    if (currentFormCountry === 'United Kingdom') {
        form.setValue('bank_account_name', suggestion.bank_account_name || '', options);
        form.setValue('sort_code', suggestion.sort_code || '', options);
        form.setValue('account_number', suggestion.account_number || '', options);
        form.setValue('supplier_address', suggestion.address || '', options);
        form.setValue('iban_number', '', options);
    } else {
        form.setValue('supplier_address', suggestion.address || '', options);
        form.setValue('iban_number', suggestion.iban_number || '', options);
        form.setValue('bank_account_name', suggestion.bank_account_name || '', options);
        form.setValue('sort_code', '', options);
        form.setValue('account_number', '', options);
    }
    
    form.setValue('categories', [{ category: "", amount: 0 }], options);
    form.setValue('total_amount', 0.00, options);

    setIsSuggestionDialogOpen(false);
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const hasRentCategory = values.categories.some(c => c.category === '950_rent');
    
    if (hasRentCategory && values.sku_number && !values.not_sku_related) {
      const toastId = showLoading("Checking for duplicate standing orders...");
      try {
        const { data: duplicateOrders, error: checkError } = await supabase
          .from('standing_orders')
          .select('*')
          .eq('sku', values.sku_number)
          .eq('status', 'active')
          .contains('categories', JSON.stringify([{ category: '950_rent' }]));

        if (checkError) {
          console.error("Error checking for duplicates:", checkError);
        } else if (duplicateOrders && duplicateOrders.length > 0) {
          dismissToast(toastId);
          setDuplicateStandingOrderData(duplicateOrders[0]);
          setPendingSubmissionValues(values);
          setIsDuplicateWarningOpen(true);
          return;
        }
      } catch (e) {
        console.error("Exception checking for duplicates:", e);
      }
      dismissToast(toastId);
    }

    await processSubmission(values);
  };

  const processSubmission = async (values: z.infer<typeof formSchema>) => {
    const toastId = showLoading("Creating payment request...");

    try {
      if (!user?.id) {
        throw new Error("User not authenticated.");
      }

      const invoiceFiles: FileList = values.invoice_pdf;
      const uploadedInvoiceUrls: string[] = [];

      for (let i = 0; i < invoiceFiles.length; i++) {
        const file = invoiceFiles[i];
        const fileExtension = file.name.split('.').pop();
        const fileName = `${user.id}/${crypto.randomUUID()}.${fileExtension}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Failed to upload invoice ${file.name}: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from('invoices')
          .getPublicUrl(fileName);

        if (!publicUrlData?.publicUrl) {
          throw new Error(`Failed to get public URL for invoice ${file.name}.`);
        }
        uploadedInvoiceUrls.push(publicUrlData.publicUrl);
      }

      const finalCurrency = values.country === 'United Kingdom' ? 'GBP' : values.currency;

      const bankDetails = values.country === 'United Kingdom'
        ? {
            iban_number: null,
            sort_code: values.sort_code,
            account_number: values.account_number?.replace(/\s/g, ''),
            bank_account_name: values.bank_account_name,
          }
        : {
            iban_number: values.iban_number,
            sort_code: null,
            account_number: null,
            bank_account_name: values.country === 'Switzerland' ? values.bank_account_name : null,
          };

      const { error: insertError } = await supabase
        .from('payment_requests')
        .insert({
          requester_id: user.id,
          supplier_name: values.supplier_name,
          sku_number: values.not_sku_related ? null : values.sku_number,
          not_sku_related: values.not_sku_related,
          lease_id: values.lease_id || null,
          supplier_address: values.supplier_address,
          ...bankDetails,
          currency: finalCurrency,
          total_amount: values.total_amount,
          reason_for_payment: values.notes || null,
          date_payment_required: values.date_payment_required.toISOString().split('T')[0],
          invoice_pdf_urls: uploadedInvoiceUrls,
          status: 'pending',
          receipt_required: values.receipt_required,
          is_urgent: values.is_urgent,
          country: values.country,
          categories: values.categories,
          bank_details_verified: values.bank_details_verified,
        });

      if (insertError) {
        throw new Error(`Failed to create payment request: ${insertError.message}`);
      }

      dismissToast(toastId);
      showSuccess("Payment request created successfully!");
      form.reset({
        supplier_name: "",
        sku_number: defaultSkuPrefix,
        currency: initialCurrency,
        total_amount: 0.00,
        receipt_required: false,
        is_urgent: false,
        not_sku_related: false,
        invoice_pdf: undefined,
        lease_id: "",
        iban_number: "",
        sort_code: "",
        account_number: "",
        bank_account_name: "",
        country: currentCountry,
        categories: [{ category: "", amount: 0 }],
        supplier_address: "",
        notes: "",
        date_payment_required: undefined,
        bank_details_verified: false,
      });
      navigate('/dashboard');
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred.");
      console.error("Error creating payment request:", error);
    }
  };

  const handleConfirmDuplicate = () => {
    if (pendingSubmissionValues) {
      setIsDuplicateWarningOpen(false);
      processSubmission(pendingSubmissionValues);
    }
  };

  const filteredCategoryOptions = categoryOptions.filter(option =>
    !option.countries || option.countries.includes(formCountry)
  );

  return (
    <div className="container mx-auto py-8">
      <Card className="max-w-2xl mx-auto shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Create New Payment Request</CardTitle>
        </CardHeader>
        <CardContent>
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
                      {userProfile?.role !== 'admin' && isCountryLocked ? "Your country is set by your profile and cannot be changed." : "Select the country for this payment request."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplier_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Supplier Name<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., ABC Corp"
                        {...field}
                        onBlur={(e) => {
                          field.onBlur();
                          handleSupplierNameBlur();
                        }}
                        disabled={form.formState.isSubmitting || isSearchingSupplier}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
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
                              />
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <SelectTrigger>
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
                name="sku_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">SKU Number</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl className="flex-1">
                        <PrefixedInput prefix={formCountry === 'United Kingdom' ? 'UK' : 'CH'} placeholder="e.g., 12345" {...field} disabled={notSkuRelated} />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          const sku = form.getValues('sku_number');
                          if (sku) {
                            const url = `https://portal.kassoehousing.com/admin/kassoe-theme/categories/edit/115?_method=PUT&Filter%5BKassoeThemeProducts__sku%5D=${encodeURIComponent(sku)}`;
                            window.open(url, '_blank');
                          } else {
                            showError("Please enter an SKU number first.");
                          }
                        }}
                        disabled={notSkuRelated}
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Check Accommodation in Platform</span>
                    </div>
                    <FormDescription>
                      {notSkuRelated ? "SKU field is optional as 'Not SKU Related' is checked." : `SKU Number must start with '${formCountry === 'United Kingdom' ? 'UK' : 'CH'}' and be followed by numbers.`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <PropertyAddressField skuValue={skuValue} country={formCountry} />
              <FormField
                control={form.control}
                name="not_sku_related"
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
                        Not SKU Related
                      </FormLabel>
                      <FormDescription>
                        Check this box if this payment request is not associated with an SKU.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lease_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Lease ID (Optional)</FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="e.g., 123456" {...field} />
                    </FormControl>
                    <FormDescription>
                      Enter a numerical Lease ID if applicable.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplier_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Supplier Address<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <FormControl>
                      <Textarea placeholder="e.g., 123 Main St, Anytown, USA" {...field} />
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
                              let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
                              if (value.length > 6) value = value.substring(0, 6); // Max 6 digits
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
                        <FormLabel className="font-semibold">Bank Account Number<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., 1234 5678"
                            {...field}
                            value={field.value || ''} // Simply pass value without formatting logic
                            onChange={(e) => field.onChange(e.target.value)} // Simple text input
                          />
                        </FormControl>
                        <FormDescription>
                          Enter the 8-digit Bank Account Number.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bank_account_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Bank Account Name<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., John Doe" {...field} />
                        </FormControl>
                        <FormDescription>
                          Enter the name of the bank account holder.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : (
                <>
                  {formCountry === 'Switzerland' && (
                    <FormField
                      control={form.control}
                      name="bank_account_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold">Bank Account Name<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., John Doe" {...field} />
                          </FormControl>
                          <FormDescription>
                            Enter the name of the bank account holder.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
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
                  <FormItem>
                    <div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-blue-50 border-blue-200">
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
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Notes</FormLabel>
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
                    <FormLabel className="font-semibold">Date Payment Required<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
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
                    <FormLabel className="font-semibold">Invoice Document(s)<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <FormControl>
                      <FileInput
                        {...fieldProps}
                        label="Choose Invoice Document(s)"
                        accept=".pdf,.jpg,.jpeg,.png"
                        value={value}
                        onChange={onChange}
                        multiple
                      />
                    </FormControl>
                    <FormDescription>
                      You can upload multiple PDF, JPG, JPEG, or PNG documents (max 5MB each).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="receipt_required"
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
                        Payment Receipt Required?
                      </FormLabel>
                      <FormDescription>
                        Check this box if a receipt is required after the payment is made.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_urgent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-red-50 border-red-200">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-red-700">
                        Mark as Urgent
                      </FormLabel>
                      <FormDescription className="text-red-600">
                        Check this box if this payment request is urgent and requires immediate attention.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground">
                Submit Payment Request
              </Button>
            </form>
          </Form>

          <AlertDialog open={isDuplicateWarningOpen} onOpenChange={setIsDuplicateWarningOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center text-amber-600">
                  <AlertTriangle className="mr-2 h-6 w-6" /> Duplicate Warning
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3 pt-2">
                  <p className="font-semibold text-gray-900">
                    There is an active standing order in place for this SKU with the "Rent" category.
                  </p>
                  {duplicateStandingOrderData && (
                    <div className="bg-amber-50 p-3 rounded border border-amber-200 text-sm">
                      <p><strong>Payee:</strong> {duplicateStandingOrderData.payee}</p>
                      <p><strong>Amount:</strong> {formatAmount(duplicateStandingOrderData.total_amount)} {duplicateStandingOrderData.currency || ''}</p>
                      <p><strong>Start Date:</strong> {new Date(duplicateStandingOrderData.payment_date).toLocaleDateString()}</p>
                    </div>
                  )}
                  <p>Do you still wish to submit this payment request?</p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setIsDuplicateWarningOpen(false)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmDuplicate} className="bg-amber-600 hover:bg-amber-700">
                  Yes, Submit Anyway
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog open={isSuggestionDialogOpen} onOpenChange={setIsSuggestionDialogOpen}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-bold">Existing Payee Suggestions</DialogTitle>
                <DialogDescription>
                  We found existing payees with a similar name. You can use their details to pre-fill the form.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {supplierSuggestions.length > 0 ? (
                  supplierSuggestions.map((suggestion, index) => (
                    <Card key={index} className="p-4 border shadow-sm">
                      <h3 className="font-bold text-lg mb-2">{suggestion.name}</h3>
                      <p className="text-sm text-muted-foreground">Source: {suggestion.source_type === 'payment_request' ? 'Payment Request' : 'Standing Order'}</p>
                      <p className="text-sm text-muted-foreground">Account Name: {suggestion.bank_account_name || 'N/A'}</p>
                      <p className="text-sm text-muted-foreground">Currency: {suggestion.currency || 'N/A'}</p>
                      {suggestion.country === 'United Kingdom' ? (
                        <>
                          <p className="text-sm text-muted-foreground">Sort Code: {suggestion.sort_code || 'N/A'}</p>
                          <p className="text-sm text-muted-foreground">Bank Account Number: {suggestion.account_number || 'N/A'}</p>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default NewPaymentRequest;