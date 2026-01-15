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
import { PlusCircle, MinusCircle, DollarSign, Search, AlertTriangle, Home } from 'lucide-react';

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
import { Badge } from '@/components/ui/badge';

const formSchema = z.object({
  supplier_name: z.string().min(1, "Supplier Name is required"),
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
    sku: z.string().optional(),
    not_sku_related: z.boolean().default(false),
  })).min(1, "At least one category with an amount is required."),
  bank_details_verified: z.boolean().refine(val => val === true, "You must confirm bank details have been verified."),
}).superRefine((data, ctx) => {
  const skuPrefix = data.country === 'United Kingdom' ? 'UK' : 'CH';

  data.categories.forEach((cat, index) => {
    if (!cat.not_sku_related) {
      if (!cat.sku || cat.sku.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `SKU is required for category ${index + 1} unless 'No SKU' is checked.`,
          path: ['categories', index, 'sku'],
        });
      } else if (!cat.sku.startsWith(skuPrefix)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `SKU must start with '${skuPrefix}'.`,
          path: ['categories', index, 'sku'],
        });
      } else if (!new RegExp(`^${skuPrefix}\\d+$`).test(cat.sku)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `SKU must be '${skuPrefix}' followed by numbers.`,
          path: ['categories', index, 'sku'],
        });
      }
    }
  });

  if (data.country === 'United Kingdom') {
    if (data.currency !== 'GBP') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency must be GBP for United Kingdom.",
        path: ['currency'],
      });
    }
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
  } else if (data.country === 'Switzerland') {
    if (!data.currency || data.currency.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Currency is required for Switzerland.",
        path: ['currency'],
      });
    }
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
      categories: [{ category: "", amount: 0, sku: defaultSkuPrefix, not_sku_related: false }],
      bank_details_verified: false,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "categories",
  });

  const formCountry = form.watch("country");
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

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

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
    
    form.setValue('categories', [{ category: "", amount: 0, sku: defaultSkuPrefix, not_sku_related: false }], options);
    form.setValue('total_amount', 0.00, options);

    setIsSuggestionDialogOpen(false);
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const rentCategories = values.categories.filter(c => c.category === '950_rent' && c.sku && !c.not_sku_related);
    
    if (rentCategories.length > 0) {
      const toastId = showLoading("Checking for duplicate standing orders...");
      try {
        const { data: duplicateOrders, error: checkError } = await supabase
          .from('standing_orders')
          .select('*')
          .eq('status', 'active')
          .in('sku', rentCategories.map(c => c.sku))
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

        const { error: uploadError } = await supabase.storage
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
          sku_number: null, // No longer global
          not_sku_related: false, // No longer global
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
      form.reset();
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
                    <Select 
                      onValueChange={(val) => {
                        field.onChange(val);
                        const newSkuPrefix = val === 'United Kingdom' ? 'UK' : 'CH';
                        const newCurrency = val === 'United Kingdom' ? 'GBP' : 'CHF';
                        form.setValue('currency', newCurrency);
                        form.setValue('iban_number', '');
                        form.setValue('sort_code', '');
                        form.setValue('account_number', '');
                        form.setValue('bank_account_name', '');
                        form.setValue('categories', [{ category: "", amount: 0, sku: newSkuPrefix, not_sku_related: false }]);
                      }} 
                      value={field.value} 
                      disabled={userProfile?.role !== 'admin' && isCountryLocked}
                    >
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
              
              {/* UI: Making the categories section stand out */}
              <div className="space-y-4 bg-blue-50/50 p-6 rounded-xl border-2 border-blue-100 shadow-inner">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold flex items-center text-blue-900">
                    <DollarSign className="mr-2 h-5 w-5" /> Charges & Properties
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ category: "", amount: 0, sku: defaultSkuPrefix, not_sku_related: false })}
                    className="shadow-sm bg-white hover:bg-blue-50"
                  >
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Line Item
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {fields.map((item, index) => (
                    <Card key={item.id} className="p-4 shadow-sm border-2 border-muted bg-white/80">
                      <div className="flex justify-between items-center mb-4">
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">Line Item #{index + 1}</Badge>
                        {fields.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                            <MinusCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`categories.${index}.category`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-semibold">Category<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger className="bg-white">
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
                            <FormItem>
                              <FormLabel className="font-semibold">Amount<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  step="0.01" 
                                  placeholder="0.00" 
                                  {...field}
                                  className="bg-white"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`categories.${index}.sku`}
                          render={({ field }) => {
                            const isNoSku = watchedCategories?.[index]?.not_sku_related;
                            return (
                              <FormItem className="md:col-span-1">
                                <FormLabel className="font-semibold">Property (SKU)</FormLabel>
                                <div className="flex items-center gap-2">
                                  <FormControl className="flex-1">
                                    <PrefixedInput 
                                      prefix={formCountry === 'United Kingdom' ? 'UK' : 'CH'} 
                                      placeholder="e.g., 12345" 
                                      {...field} 
                                      disabled={isNoSku} 
                                      className="bg-white"
                                    />
                                  </FormControl>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => {
                                      if (field.value) {
                                        window.open(`https://portal.kassoehousing.com/admin/kassoe-theme/categories/edit/115?_method=PUT&Filter%5BKassoeThemeProducts__sku%5D=${encodeURIComponent(field.value)}`, '_blank');
                                      }
                                    }}
                                    disabled={isNoSku}
                                    className="bg-white"
                                  >
                                    <Search className="h-4 w-4" />
                                  </Button>
                                </div>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                        <div className="flex flex-col justify-end pb-1">
                          <FormField
                            control={form.control}
                            name={`categories.${index}.not_sku_related`}
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-2 space-y-0 p-2 border rounded-md bg-white">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                                <FormLabel className="text-sm cursor-pointer">
                                  No SKU / Not Property Related
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                      {watchedCategories?.[index]?.sku && !watchedCategories?.[index]?.not_sku_related && (
                        <div className="mt-4 pt-4 border-t border-blue-50">
                          <PropertyAddressField skuValue={watchedCategories[index].sku} country={formCountry} />
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
                
                <div className="bg-blue-600 text-white p-4 rounded-xl flex justify-between items-center text-lg font-bold mt-6 shadow-md">
                  <span>Total Amount:</span>
                  <span>{form.watch('total_amount').toFixed(2)} {finalCurrencyLabel(form.watch('country'), form.watch('currency'))}</span>
                </div>
              </div>

              {formCountry !== 'United Kingdom' ? (
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
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="lease_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold">Lease ID (Optional)</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="e.g., 123456" {...field} />
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
              </div>

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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="sort_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold">Sort Code<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., 12-34-56" {...field} />
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
                          <FormLabel className="font-semibold">Account Number<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., 1234 5678" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="bank_account_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold">Bank Account Name<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., John Doe" {...field} />
                        </FormControl>
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
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-blue-700 font-bold">
                          I have verified these bank details with the payee.<span className="text-red-600 ml-1 text-lg font-bold">*</span>
                        </FormLabel>
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
                    <FormLabel className="font-semibold">General Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="e.g., Additional context for the finance team..." {...field} />
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
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Payment Receipt Required?</FormLabel>
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
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-red-700">Mark as Urgent</FormLabel>
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
                    An active standing order exists for a property in this request with the "Rent" category.
                  </p>
                  {duplicateStandingOrderData && (
                    <div className="bg-amber-50 p-3 rounded border border-amber-200 text-sm">
                      <p><strong>Payee:</strong> {duplicateStandingOrderData.payee}</p>
                      <p><strong>Amount:</strong> {formatAmount(duplicateStandingOrderData.total_amount)} {duplicateStandingOrderData.currency || ''}</p>
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
                <DialogDescription>Use existing details to pre-fill the form.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {supplierSuggestions.map((suggestion, index) => (
                  <Card key={index} className="p-4 border shadow-sm">
                    <h3 className="font-bold text-lg mb-2">{suggestion.name}</h3>
                    <p className="text-sm text-muted-foreground">Account Name: {suggestion.bank_account_name || 'N/A'}</p>
                    <Button
                      onClick={() => handleUseSuggestion(suggestion)}
                      className="mt-4 w-full bg-dyad-blue hover:bg-dyad-blue-light text-dyad-blue-foreground"
                    >
                      Use This Information
                    </Button>
                  </Card>
                ))}
              </div>
              <Button variant="destructive" onClick={() => setIsSuggestionDialogOpen(false)} className="mt-4 w-full">Enter New Details</Button>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
};

const finalCurrencyLabel = (country: string, selectedCurrency: string) => {
  return country === 'United Kingdom' ? 'GBP' : selectedCurrency;
};

export default NewPaymentRequest;