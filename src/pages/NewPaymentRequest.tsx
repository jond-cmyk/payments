"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry

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

// List of major currencies, expanded and sorted alphabetically
const majorCurrencies = [
  { value: 'ALL', label: 'ALL - Albanian Lek' },
  { value: 'AMD', label: 'AMD - Armenian Dram' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'AZN', label: 'AZN - Azerbaijani Manat' },
  { value: 'BAM', label: 'BAM - Bosnia and Herzegovina Convertible Mark' },
  { value: 'BGN', label: 'BGN - Bulgarian Lev' },
  { value: 'BYN', label: 'BYN - Belarusian Ruble' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'CHF', label: 'CHF - Swiss Franc' },
  { value: 'CNY', label: 'CNY - Chinese Yuan' },
  { value: 'CZK', label: 'CZK - Czech Koruna' },
  { value: 'DKK', label: 'DKK - Danish Krone' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'GEL', label: 'GEL - Georgian Lari' },
  { value: 'HKD', label: 'HKD - Hong Kong Dollar' },
  { value: 'HUF', label: 'HUF - Hungarian Forint' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'ISK', label: 'ISK - Icelandic Króna' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
  { value: 'MKD', label: 'MKD - Macedonian Denar' },
  { value: 'MDL', label: 'MDL - Moldovan Leu' },
  { value: 'MXN', label: 'MXN - Mexican Peso' },
  { value: 'NOK', label: 'NOK - Norwegian Krone' },
  { value: 'NZD', label: 'NZD - New Zealand Dollar' },
  { value: 'PLN', label: 'PLN - Polish Zloty' },
  { value: 'RON', label: 'RON - Romanian Leu' },
  { value: 'RSD', label: 'RSD - Serbian Dinar' },
  { value: 'SEK', label: 'SEK - Swedish Krona' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'TRY', label: 'TRY - Turkish Lira' },
  { value: 'UAH', label: 'UAH - Ukrainian Hryvnia' },
  { value: 'USD', label: 'USD - United States Dollar' },
  { value: 'ZAR', label: 'ZAR - South African Rand' },
].sort((a, b) => a.label.localeCompare(b.label)); // Ensure alphabetical order

// Define the Zod schema for form validation
const formSchema = z.object({
  supplier_name: z.string().min(1, "Supplier Name is required"),
  sku_number: z.string().optional(), // Make optional initially, then refine
  not_sku_related: z.boolean().default(false), // New field
  lease_id: z.string().optional().refine((val) => { // New field
    if (val === undefined || val === null || val.trim() === '') return true; // Optional, so empty is fine
    return /^\d+$/.test(val); // Must be numerical if present
  }, "Lease ID must be a numerical value."),
  supplier_address: z.string().min(1, "Supplier Address is required"),
  iban_number: z.string().optional(), // Made optional
  sort_code: z.string().optional(), // New field
  account_number: z.string().optional(), // New field
  bank_account_name: z.string().optional(), // New field
  currency: z.string().min(1, "Currency is required"),
  payment_amount: z.coerce.number().min(0.01, "Payment Amount must be positive"),
  reason_for_payment: z.string().min(1, "Reason for Payment is required"),
  date_payment_required: z.date({
    required_error: "Date Payment Required is required",
  }),
  invoice_pdf: z.any()
    .refine((files) => files?.length > 0, "At least one Invoice PDF is required.")
    .refine((files) => Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024, "Max file size is 5MB per file.")) // 5MB limit per file
    .refine((files) => Array.from(files as FileList).every(file => file.type === "application/pdf"), "Only .pdf files are accepted."),
  receipt_required: z.boolean().default(false),
  is_urgent: z.boolean().default(false), // New field
  country: z.string().min(1, "Country is required"), // ADDED: country field to schema
}).superRefine((data, ctx) => {
  const skuPrefix = data.country === 'United Kingdom' ? 'UK' : 'CH'; // Determine prefix for validation

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
    if (!data.bank_account_name || data.bank_account_name.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank Account Name is required.",
        path: ['bank_account_name'],
      });
    }
    // Ensure IBAN is not provided for UK
    if (data.iban_number && data.iban_number.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IBAN Number should not be provided for United Kingdom.",
        path: ['iban_number'],
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
    if (data.bank_account_name && data.bank_account_name.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bank Account Name should not be provided for this country.",
        path: ['bank_account_name'],
      });
    }
  }
});

const NewPaymentRequest = () => {
  const { session, isLoading, user, userProfile } = useSession(); // Added userProfile
  const { currentCountry, availableCountries, isCountryLocked } = useCountry(); // Get isCountryLocked and availableCountries
  const navigate = useNavigate();

  const defaultSkuPrefix = currentCountry === 'United Kingdom' ? 'UK' : 'CH';
  const defaultCurrency = currentCountry === 'United Kingdom' ? 'GBP' : 'CHF';

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplier_name: "",
      sku_number: defaultSkuPrefix, // Default based on country
      not_sku_related: false, // Default to false
      lease_id: "", // Default for new field
      supplier_address: "",
      iban_number: currentCountry === 'United Kingdom' ? "" : "", // Default empty for both, but IBAN will be validated conditionally
      sort_code: currentCountry === 'United Kingdom' ? "" : "",
      account_number: currentCountry === 'United Kingdom' ? "" : "",
      bank_account_name: currentCountry === 'United Kingdom' ? "" : "",
      currency: defaultCurrency, // Default based on country
      payment_amount: 0.00,
      reason_for_payment: "",
      date_payment_required: undefined,
      invoice_pdf: undefined,
      receipt_required: false,
      is_urgent: false, // Default to not urgent
      country: currentCountry, // ADDED: Set default country from context
    },
    // REMOVED: context property as country is now a form field
  });

  // Watch the not_sku_related field to dynamically update validation and input state
  const notSkuRelated = form.watch("not_sku_related");
  const formCountry = form.watch("country"); // Watch the country field in the form

  // Effect to reset form defaults if currentCountry changes
  React.useEffect(() => {
    const newSkuPrefix = currentCountry === 'United Kingdom' ? 'UK' : 'CH';
    const newCurrency = currentCountry === 'United Kingdom' ? 'GBP' : 'CHF';

    form.reset((prev) => ({
      ...prev,
      sku_number: newSkuPrefix,
      currency: newCurrency,
      iban_number: currentCountry === 'United Kingdom' ? "" : "",
      sort_code: currentCountry === 'United Kingdom' ? "" : "",
      account_number: currentCountry === 'United Kingdom' ? "" : "",
      bank_account_name: currentCountry === 'United Kingdom' ? "" : "",
      country: currentCountry, // Ensure form's country field is updated
    }));
  }, [currentCountry, form]);


  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    // --- START DEBUG LOGS ---
    console.log("--- NewPaymentRequest Submission Debug ---");
    console.log("Logged-in User ID (auth.uid()):", user?.id);
    console.log("User Profile Country (from SessionContext):", userProfile?.country);
    console.log("Form Submitted Country (values.country):", values.country);
    console.log("Form Submitted Requester ID (user.id):", user?.id);
    console.log("-----------------------------------------");
    // --- END DEBUG LOGS ---

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

      // Prepare bank details based on country
      const bankDetails = values.country === 'United Kingdom'
        ? {
            iban_number: null,
            sort_code: values.sort_code,
            account_number: values.account_number?.replace(/\s/g, ''), // Remove spaces for DB storage
            bank_account_name: values.bank_account_name,
          }
        : {
            iban_number: values.iban_number,
            sort_code: null,
            account_number: null,
            bank_account_name: null,
          };

      // Insert payment request data into Supabase
      const { error: insertError } = await supabase
        .from('payment_requests')
        .insert({
          requester_id: user.id,
          supplier_name: values.supplier_name,
          sku_number: values.not_sku_related ? null : values.sku_number, // Set to null if not SKU related
          not_sku_related: values.not_sku_related, // Save the checkbox state
          lease_id: values.lease_id || null, // Include lease_id, set to null if empty
          supplier_address: values.supplier_address,
          ...bankDetails, // Spread the conditional bank details
          currency: values.currency,
          payment_amount: values.payment_amount,
          reason_for_payment: values.reason_for_payment,
          date_payment_required: values.date_payment_required.toISOString().split('T')[0],
          invoice_pdf_urls: uploadedInvoiceUrls, // Store array of URLs
          status: 'pending',
          receipt_required: values.receipt_required,
          is_urgent: values.is_urgent, // Save urgent status
          country: values.country, // Add the current country from form values
        });

      if (insertError) {
        throw new Error(`Failed to create payment request: ${insertError.message}`);
      }

      dismissToast(toastId);
      showSuccess("Payment request created successfully!");
      form.reset({
        sku_number: defaultSkuPrefix,
        currency: defaultCurrency,
        payment_amount: 0.00,
        receipt_required: false,
        is_urgent: false,
        not_sku_related: false,
        invoice_pdf: undefined,
        lease_id: "",
        iban_number: currentCountry === 'United Kingdom' ? "" : "",
        sort_code: currentCountry === 'United Kingdom' ? "" : "",
        account_number: currentCountry === 'United Kingdom' ? "" : "",
        bank_account_name: currentCountry === 'United Kingdom' ? "" : "",
        country: currentCountry, // Reset country to current context country
      });
      navigate('/dashboard');
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred.");
      console.error("Error creating payment request:", error);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card className="max-w-2xl mx-auto shadow-sm"> {/* Added shadow-sm */}
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Create New Payment Request</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Country</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={userProfile?.role !== 'admin' && isCountryLocked}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableCountries.map((country) => (
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
                      <Input placeholder="e.g., ABC Corp" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sku_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">SKU Number</FormLabel>
                    <FormControl>
                      <PrefixedInput prefix={formCountry === 'United Kingdom' ? 'UK' : 'CH'} placeholder="e.g., 12345" {...field} disabled={notSkuRelated} />
                    </FormControl>
                    <FormDescription>
                      {notSkuRelated ? "SKU field is optional as 'Not SKU Related' is checked." : `SKU Number must start with '${formCountry === 'United Kingdom' ? 'UK' : 'CH'}' and be followed by numbers.`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                        <FormLabel className="font-semibold">Account Number<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., 1234 5678"
                            {...field}
                            onChange={(e) => {
                              let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
                              if (value.length > 8) value = value.substring(0, 8); // Max 8 digits
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
              )}

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Currency<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a currency" />
                        </SelectTrigger>
                      </FormControl>
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
              <FormField
                control={form.control}
                name="payment_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Payment Amount<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="e.g., 123.45" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reason_for_payment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Reason for Payment<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
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
                    <FormLabel className="font-semibold">Invoice PDF(s)<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <FormControl>
                      <FileInput
                        {...fieldProps}
                        label="Choose Invoice PDF(s)"
                        accept=".pdf"
                        value={value}
                        onChange={onChange}
                        multiple // Enable multiple file selection
                      />
                    </FormControl>
                    <FormDescription>
                      You can upload multiple PDF invoices (max 5MB each).
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
        </CardContent>
      </Card>
    </div>
  );
};

export default NewPaymentRequest;