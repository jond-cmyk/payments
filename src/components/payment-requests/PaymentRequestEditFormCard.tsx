"use client";

import React, { useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import * as z from 'zod';
import { Download, PlusCircle, MinusCircle, DollarSign } from 'lucide-react';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/integrations/supabase/SessionContext';

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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { PaymentRequest, PayeeSuggestion } from '@/types/supabase';
import { categoryOptions } from '@/lib/constants';
import { majorCurrencies, EditFormSchema } from '@/schemas/paymentRequestSchema';

interface PaymentRequestEditFormCardProps {
  request: PaymentRequest;
  editForm: ReturnType<typeof useForm<EditFormSchema>>;
  handleRequesterEditSubmit: (values: EditFormSchema) => Promise<void>;
}

// Helper function to format UK account number for display
const formatUkAccountNumber = (raw: string | undefined | null): string => {
  if (raw === undefined || raw === null) return '';
  let value = String(raw).replace(/\D/g, '');
  if (value.length > 8) value = value.substring(0, 8);
  if (value.length > 4) return value.slice(0, 4) + ' ' + value.slice(4);
  return value;
};

const PaymentRequestEditFormCard: React.FC<PaymentRequestEditFormCardProps> = ({
  request,
  editForm,
  handleRequesterEditSubmit,
}) => {
  const { availableCountries, isCountryLocked } = useCountry();
  const { user } = useSession();

  const [supplierSuggestions, setSupplierSuggestions] = useState<PayeeSuggestion[]>([]);
  const [isSuggestionDialogOpen, setIsSuggestionDialogOpen] = useState(false);
  const [isSearchingSupplier, setIsSearchingSupplier] = useState(false);

  const { fields, append, remove } = useFieldArray({
    control: editForm.control,
    name: "categories",
  });

  // Watch fields
  const notSkuRelated = editForm.watch("not_sku_related");
  const formCountry = editForm.watch("country");
  const skuPrefix = formCountry === 'United Kingdom' ? 'UK' : 'CH';

  const watchedCategories = useWatch({
    control: editForm.control,
    name: "categories",
    defaultValue: editForm.getValues("categories"),
  });

  // Calculate total amount whenever categories array changes
  React.useEffect(() => {
    // console.log("[PaymentRequestEditFormCard] watchedCategories changed:", watchedCategories);
    const newTotal = (watchedCategories || []).reduce((sum, categoryItem) => {
      // Ensure amount is treated as a number, defaulting to 0 if invalid
      const parsedAmount = parseFloat(categoryItem?.amount as any) || 0;
      return sum + parsedAmount;
    }, 0);
    editForm.setValue("total_amount", newTotal, { shouldValidate: true });
  }, [watchedCategories, editForm]);

  // Effect to update currency when country changes in the form
  React.useEffect(() => {
    const newCurrency = formCountry === 'United Kingdom' ? 'GBP' : 'CHF';
    // Only set value if the country is UK (to enforce GBP) or if the current value is empty/null (to enforce CHF default)
    if (formCountry === 'United Kingdom' && editForm.getValues('currency') !== 'GBP') {
        editForm.setValue('currency', 'GBP', { shouldValidate: true });
    } else if (formCountry === 'Switzerland' && !editForm.getValues('currency')) {
        editForm.setValue('currency', 'CHF', { shouldValidate: true });
    }
  }, [formCountry, editForm]);

  // Filter category options based on the selected country in the form
  const filteredCategoryOptions = categoryOptions.filter(option =>
    !option.countries || option.countries.includes(formCountry)
  );

  const handleSupplierNameBlur = async () => {
    const supplierName = editForm.getValues('supplier_name');
    const currentFormCountry = editForm.getValues('country');

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
    editForm.setValue('supplier_name', suggestion.name, options);
    editForm.setValue('supplier_address', suggestion.address || '', options);
    editForm.setValue('iban_number', suggestion.iban_number || '', options);
    editForm.setValue('sort_code', suggestion.sort_code || '', options);
    editForm.setValue('account_number', suggestion.account_number || '', options);
    editForm.setValue('bank_account_name', suggestion.bank_account_name || '', options);
    editForm.setValue('currency', suggestion.currency || (editForm.getValues('country') === 'United Kingdom' ? 'GBP' : 'CHF'), options);
    editForm.setValue('bank_details_verified', false, options);
    
    // Clear categories and total amount when using suggestion, as search-all-payees doesn't return this data
    editForm.setValue('categories', [{ category: "", amount: 0 }], options);
    editForm.setValue('total_amount', 0.00, options);

    setIsSuggestionDialogOpen(false);
  };

  return (
    <Card className="mb-8 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">
          Amend Payment Request
        </CardTitle>
        <CardDescription>
          Update the details for this payment request.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                      {availableCountries.filter(c => c.value !== 'all').map((country) => (
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
                    <Input
                      placeholder="e.g., ABC Corp"
                      {...field}
                      onBlur={(e) => {
                        field.onBlur();
                        handleSupplierNameBlur(); // Call our custom blur handler
                      }}
                      disabled={editForm.formState.isSubmitting || isSearchingSupplier}
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
                      control={editForm.control}
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
                      control={editForm.control}
                      name={`categories.${index}.amount`}
                      render={({ field }) => (
                        <FormItem className="flex-1 w-full">
                          <FormLabel className={index === 0 ? "font-semibold" : "sr-only"}>Amount</FormLabel>
                          <FormControl>
                            <Input 
                              type="text" // CHANGED to text to prevent browser truncation issues
                              step="0.01" 
                              placeholder="Amount" 
                              {...field}
                              // FIX: Ensure value is always a string representation of the number, and handle empty string correctly
                              value={field.value === 0 ? "" : String(field.value)}
                              onChange={(e) => {
                                // Only allow numbers and a single decimal point
                                const rawValue = e.target.value.replace(/[^\d.]/g, '');
                                // Force conversion to number here to ensure RHF stores the correct numeric value immediately
                                field.onChange(rawValue === "" ? 0 : parseFloat(rawValue));
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
                  <span>{editForm.getValues('total_amount').toFixed(2)}</span>
                </div>
                <FormField
                  control={editForm.control}
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

            {/* Currency field: Conditional rendering */}
            {formCountry !== 'United Kingdom' ? (
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
            ) : (
              <div className="space-y-2">
                <FormLabel className="font-semibold">Currency</FormLabel>
                <Input value="GBP - British Pound (Fixed)" disabled className="bg-muted/50" />
                <FormDescription>Currency is fixed to GBP for United Kingdom.</FormDescription>
              </div>
            )}

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
                          value={formatUkAccountNumber(field.value)} // Apply formatting for display
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
              <>
                {/* NEW: Bank Account Name for Switzerland */}
                {formCountry === 'Switzerland' && (
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
                )}
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
              </>
            )}

            <FormField
              control={editForm.control}
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
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
            
            <FormField
              control={editForm.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Notes</FormLabel>
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
      </CardContent>
      {/* NEW: Supplier Suggestions Dialog */}
      <Dialog open={isSuggestionDialogOpen} onOpenChange={setIsSuggestionDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-bold">Existing Payee Suggestions</DialogTitle>
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
                      <p className="text-sm text-muted-foreground">Account Number: {suggestion.account_number ? suggestion.account_number.replace(/(\d{4})(\d{4})/, '$1 $2') : 'N/A'}</p>
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
    </Card>
  );
};

export default PaymentRequestEditFormCard;