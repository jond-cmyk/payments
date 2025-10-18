"use client";

import React from 'react';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod'; // Added missing import
import * as z from 'zod';
import { Download, AlertTriangle } from 'lucide-react'; // Import AlertTriangle icon
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry
import { categoryOptions } from '@/lib/constants';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import DatePicker from '@/components/DatePicker';
import PrefixedInput from '@/components/PrefixedInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import FileInput from '@/components/FileInput';
import { PaymentRequest, Profile } from '@/types/supabase';
import { UseMutationResult } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge'; // Import Badge
import { cn } from '@/lib/utils'; // Import cn for utility classes

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
].sort((a, b) => a.label.localeCompare(b.label));

// Zod schema for editing payment requests (requester)
const editFormSchema = z.object({
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
    .optional() // Make optional for editing, only required if a new file is selected
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.size <= 5 * 1024 * 1024), "Max file size is 5MB per file.") // 5MB limit per file
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every(file => file.type === "application/pdf" || file.type === "image/jpeg" || file.type === "image/png"), "Only .pdf, .jpg, .jpeg, .png files are accepted."),
  receipt_required: z.boolean().default(false),
  is_urgent: z.boolean().default(false), // New field
  country: z.string().min(1, "Country is required"), // ADDED: country field to schema
  category: z.string().min(1, "Category is required"), // ADDED: category field to schema
}).superRefine((data, ctx) => {
  // Determine SKU prefix based on the request's country
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
        message: `SKU Number must be '${skuPrefix}' followed by numbers.` ,
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

interface PaymentRequestDetailsCardProps {
  request: PaymentRequest;
  isEditing: boolean;
  canAmend: boolean;
  setIsEditing: (editing: boolean) => void;
  editForm: ReturnType<typeof useForm<z.infer<typeof editFormSchema>>>;
  handleRequesterEditSubmit: (values: z.infer<typeof editFormSchema>) => Promise<void>;
  auditUsers: Record<string, string> | undefined; // Added auditUsers prop
}

const PaymentRequestDetailsCard: React.FC<PaymentRequestDetailsCardProps> = ({
  request,
  isEditing,
  canAmend,
  setIsEditing,
  editForm,
  handleRequesterEditSubmit,
  auditUsers, // Destructure auditUsers
}) => {
  const { availableCountries, isCountryLocked } = useCountry(); // Get availableCountries and isCountryLocked

  const getStatusDisplay = (status: PaymentRequest['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'setup_awaiting_approval':
        return 'Payment Setup';
      case 'approved':
        return 'Payment Complete';
      case 'declined':
        return 'Declined';
      case 'queried':
        return 'Queried'; // Changed to grey
      default:
        return status;
    }
  };

  // Watch the not_sku_related field to dynamically update validation and input state
  const notSkuRelated = editForm.watch("not_sku_related");
  const formCountry = editForm.watch("country"); // Watch the country field in the form
  const skuPrefix = formCountry === 'United Kingdom' ? 'UK' : 'CH'; // Determine prefix for display and PrefixedInput

  // Filter category options based on the selected country in the form
  const filteredCategoryOptions = categoryOptions.filter(option =>
    !option.countries || option.countries.includes(formCountry)
  );

  return (
    <Card className="mb-8 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center">
          Request Details
          {request.is_urgent && (
            <Badge variant="destructive" className={cn("ml-3 bg-red-600 text-white flex items-center", "border border-white")}> {/* Added white border */}
              <AlertTriangle className="h-4 w-4 mr-1" /> Urgent
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Status: <span className={`font-semibold ${
          request.status === 'pending' ? 'text-yellow-600' :
          request.status === 'setup_awaiting_approval' ? 'text-blue-600' :
          request.status === 'approved' ? 'text-green-600' :
          request.status === 'declined' ? 'text-red-600' :
          request.status === 'queried' ? 'text-gray-600' :
          'text-gray-600'
        }`}>
          {getStatusDisplay(request.status)}
        </span></CardDescription>
      </CardHeader>
      <CardContent>
        {isEditing && canAmend ? (
          <Form {...editForm}>
            <form id="edit-request-form" onSubmit={editForm.handleSubmit(handleRequesterEditSubmit)} className="space-y-6">
              <FormField
                control={editForm.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Country</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isCountryLocked}>
                      <SelectTrigger>
                        <FormControl>
                          <SelectValue placeholder="Select a country" />
                        </FormControl>
                      </SelectTrigger>
                      <SelectContent>
                        {availableCountries.map((country) => (
                          <SelectItem key={country.value} value={country.value}>
                            {country.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {isCountryLocked ? "Your country is set by your profile and cannot be changed." : "Select the country for this payment request."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="supplier_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Supplier Name<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Category<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
              <FormField
                control={editForm.control}
                name="sku_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">SKU Number</FormLabel>
                    <FormControl>
                      <PrefixedInput prefix={skuPrefix} {...field} disabled={notSkuRelated} />
                    </FormControl>
                    <FormDescription>
                      {notSkuRelated ? "SKU field is optional as 'Not SKU Related' is checked." : `SKU Number must start with '${skuPrefix}' and be followed by numbers.`}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
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
                control={editForm.control}
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
                control={editForm.control}
                name="supplier_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Supplier Address<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {formCountry === 'United Kingdom' ? (
                <>
                  <FormField
                    control={editForm.control}
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
                    control={editForm.control}
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
                    control={editForm.control}
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
                  control={editForm.control}
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
                control={editForm.control}
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
              <FormField
                control={editForm.control}
                name="payment_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Payment Amount<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="reason_for_payment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Reason for Payment<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
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
                control={editForm.control}
                name="invoice_pdf"
                render={({ field: { value, onChange, ...fieldProps } }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Invoice Document(s) (Upload new if needed)</FormLabel>
                    <FormControl>
                      <FileInput
                        {...fieldProps}
                        label="Choose New Invoice Document(s)"
                        accept=".pdf,.jpg,.jpeg,.png"
                        value={value}
                        onChange={onChange}
                        multiple // Enable multiple file selection
                      />
                    </FormControl>
                    <FormDescription>
                      Existing invoices will be kept. New files will be added. You can upload multiple PDF, JPG, JPEG, or PNG documents (max 5MB each).
                    </FormDescription>
                    <FormMessage />
                    {request.invoice_pdf_urls && request.invoice_pdf_urls.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="font-medium">Current Invoices:</p>
                        {request.invoice_pdf_urls.map((url, index) => (
                          <Button asChild variant="link" className="p-0 h-auto block" key={index}>
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              <Download className="mr-1 h-4 w-4" /> Invoice {index + 1}
                            </a>
                          </Button>
                        ))}
                      </div>
                    )}
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
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
                control={editForm.control}
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
            </form>
          </Form>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-bold">Requested By:</p>
              <p>{auditUsers?.[request.requester_id] || request.requester_id}</p>
            </div>
            <div>
              <p className="font-bold">Supplier Name:</p>
              <p>{request.supplier_name}</p>
            </div>
            <div>
              <p className="font-bold">Category:</p>
              <p>{categoryOptions.find(c => c.value === request.category)?.label || request.category}</p>
            </div>
            <div>
              <p className="font-bold">SKU Number:</p>
              <p>{request.not_sku_related ? 'N/A (Not SKU Related)' : request.sku_number}</p>
            </div>
            <div>
              <p className="font-bold">Lease ID:</p>
              <p>{request.lease_id || 'N/A'}</p>
            </div>
            <div>
              <p className="font-bold">Supplier Address:</p>
              <p>{request.supplier_address}</p>
            </div>
            <div>
              <p className="font-bold">Country:</p>
              <p>{request.country}</p>
            </div>
            {request.country === 'United Kingdom' ? (
              <>
                <div>
                  <p className="font-bold">Sort Code:</p>
                  <p>{request.sort_code || 'N/A'}</p>
                </div>
                <div>
                  <p className="font-bold">Account Number:</p>
                  <p>{request.account_number ? request.account_number.replace(/(\d{4})(\d{4})/, '$1 $2') : 'N/A'}</p>
                </div>
                <div>
                  <p className="font-bold">Bank Account Name:</p>
                  <p>{request.bank_account_name || 'N/A'}</p>
                </div>
              </>
            ) : (
              <div>
                <p className="font-bold">IBAN Number:</p>
                <p>{request.iban_number || 'N/A'}</p>
              </div>
            )}
            <div>
              <p className="font-bold">Currency:</p>
              <p>{request.currency}</p>
            </div>
            <div>
              <p className="font-bold">Payment Amount:</p>
              <p>{request.payment_amount?.toFixed(2) || '0.00'}</p>
            </div>
            <div>
              <p className="font-bold">Reason for Payment:</p>
              <p>{request.reason_for_payment}</p>
            </div>
            <div>
              <p className="font-bold">Date Payment Required:</p>
              <p>{format(new Date(request.date_payment_required), 'PPP')}</p>
            </div>
            <div>
              <p className="font-bold">Invoice PDF(s):</p>
              {request.invoice_pdf_urls && request.invoice_pdf_urls.length > 0 ? (
                <div className="space-y-1">
                  {request.invoice_pdf_urls.map((url, index) => (
                    <Button asChild variant="link" className="p-0 h-auto block" key={index}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <Download className="mr-1 h-4 w-4" /> Invoice {index + 1}
                      </a>
                    </Button>
                  ))}
                </div>
              ) : (
                <p>No invoices uploaded.</p>
              )}
            </div>
            {request.receipt_pdf_url && (
              <div>
                <p className="font-bold">Receipt PDF:</p>
                <Button asChild variant="link" className="p-0 h-auto">
                  <a href={request.receipt_pdf_url} target="_blank" rel="noopener noreferrer">
                        <Download className="mr-1 h-4 w-4" /> Download Receipt
                  </a>
                </Button>
              </div>
            )}
            <div className={cn(
              "space-y-1",
              request.receipt_required && "bg-dyad-blue text-white p-4 rounded-md" // Apply solid dyad blue with white text only if receipt_required is true
            )}>
              <p className="font-bold">Payment Receipt Required:</p>
              <p>{request.receipt_required ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <p className="font-bold">Created At:</p>
              <p>{format(new Date(request.created_at), 'PPP p')}</p>
            </div>
            <div>
              <p className="font-bold">Last Updated:</p>
              <p>{format(new Date(request.updated_at), 'PPP p')}</p>
            </div>
            {request.payment_setup_date && (
              <div>
                <p className="font-bold">Payment Setup Date:</p>
                <p>{format(new Date(request.payment_setup_date), 'PPP p')}</p>
              </div>
            )}
            {request.payment_approved_date && (
              <div>
                <p className="font-bold">Payment Approved Date:</p>
                <p>{format(new Date(request.payment_approved_date), 'PPP p')}</p>
              </div>
            )}
            {request.admin_action_by && (
              <div>
                <p className="font-bold">Admin Action By:</p>
                <p>{auditUsers?.[request.admin_action_by] || request.admin_action_by}</p>
              </div>
            )}
            {request.admin_action_reason && (
              <div>
                <p className="font-bold">Admin Reason:</p>
                <p>{request.admin_action_reason}</p>
              </div>
            )}
            {request.last_reminder_sent_at && (
              <div>
                <p className="font-bold">Last Reminder Sent:</p>
                <p>{format(new Date(request.last_reminder_sent_at), 'PPP p')}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PaymentRequestDetailsCard;