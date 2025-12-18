"use client";

import React from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PaymentRequest, PaymentRequestCategoryItem } from '@/types/supabase'; // Import category item type
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import DatePicker from '@/components/DatePicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import FileInput from '@/components/FileInput';
import PrefixedInput from '@/components/PrefixedInput';
import PropertyAddressField from '@/components/PropertyAddressField';
import { EditFormSchema, editFormSchema } from '@/schemas/paymentRequestSchema';
import { useSession } from '@/integrations/supabase/SessionContext';
import { categoryOptions } from '@/lib/constants';
import { PlusCircle, MinusCircle, DollarSign, Search } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast'; // Import toast helpers
import { Separator } from '@/components/ui/separator';

interface PaymentRequestEditFormCardProps {
  request: PaymentRequest;
  handleRequesterEditSubmit: (values: EditFormSchema) => Promise<void>;
}

const PaymentRequestEditFormCard: React.FC<PaymentRequestEditFormCardProps> = ({ request, handleRequesterEditSubmit }) => {
  const { userProfile } = useSession();
  const isAdmin = userProfile?.role === 'admin';

  // Format existing categories for the form
  const formattedCategories = request.categories && request.categories.length > 0
    ? request.categories
    : [{ category: "", amount: 0 }];

  const form = useForm<EditFormSchema>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      supplier_name: request.supplier_name,
      sku_number: request.sku_number || '',
      not_sku_related: request.not_sku_related || false,
      lease_id: request.lease_id || '',
      supplier_address: request.supplier_address,
      iban_number: request.iban_number || '',
      sort_code: request.sort_code || '',
      account_number: request.account_number || '',
      bank_account_name: request.bank_account_name || '', // Map bank_account_name
      currency: request.currency || (request.country === 'United Kingdom' ? 'GBP' : 'CHF'),
      total_amount: request.total_amount,
      notes: request.reason_for_payment || '',
      date_payment_required: new Date(request.date_payment_required),
      receipt_required: request.receipt_required || false,
      is_urgent: request.is_urgent || false,
      country: request.country,
      categories: formattedCategories as any, // Cast to any to bypass strict type check for form default
      bank_details_verified: request.bank_details_verified || false, // Default to true if not present, assuming legacy data was verified? Or false. Let's stick to current value.
      invoice_pdf: undefined, // File inputs are uncontrolled, so undefined
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

  // Calculate total amount whenever categories array changes
  React.useEffect(() => {
    const newTotal = (watchedCategories || []).reduce((sum, categoryItem) => {
      const parsedAmount = parseFloat(categoryItem?.amount as any) || 0;
      return sum + parsedAmount;
    }, 0);
    if (form.getValues('total_amount') !== newTotal) {
      form.setValue("total_amount", newTotal); // Update without triggering validation immediately loop
    }
  }, [watchedCategories, form]);

  const filteredCategoryOptions = categoryOptions.filter(option =>
    !option.countries || option.countries.includes(formCountry)
  );

  const isDisabled = !isAdmin && request.status !== 'pending' && request.status !== 'queried';

  return (
    <Card className="mb-6 shadow-sm border-2 border-blue-100">
      <CardHeader>
        <CardTitle>Edit Payment Request</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form id="edit-request-form" onSubmit={form.handleSubmit(handleRequesterEditSubmit)} className="space-y-4">
            
            <FormField
              control={form.control}
              name="country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                   <Select onValueChange={field.onChange} value={field.value} disabled={true}> {/* Disabled in Edit mode usually, or based on logic */}
                      <SelectTrigger>
                        <FormControl>
                          <SelectValue placeholder="Select country" />
                        </FormControl>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                        <SelectItem value="Switzerland">Switzerland</SelectItem>
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
                  <FormLabel>Supplier Name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isDisabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

             {/* Categories Section */}
             <Card className="p-4 shadow-sm">
                <CardTitle className="text-lg font-semibold mb-4 flex items-center">
                    <DollarSign className="mr-2 h-5 w-5" /> Categories & Amounts
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
                            <Select onValueChange={field.onChange} value={field.value} disabled={isDisabled}>
                                <SelectTrigger>
                                <FormControl>
                                    <SelectValue placeholder="Select category" />
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
                                disabled={isDisabled}
                                />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        {fields.length > 1 && (
                        <Button type="button" variant="outline" size="icon" onClick={() => remove(index)} className="flex-shrink-0" disabled={isDisabled}>
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
                    disabled={isDisabled}
                    >
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Category
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
                    <FormLabel>Currency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isDisabled}>
                        <SelectTrigger>
                        <FormControl>
                            <SelectValue placeholder="Select currency" />
                        </FormControl>
                        </SelectTrigger>
                        <SelectContent>
                        <SelectItem value="CHF">CHF</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
            ) : (
                 <div className="space-y-2">
                    <FormLabel>Currency</FormLabel>
                    <Input value="GBP" disabled className="bg-muted/50" />
                </div>
            )}

            <FormField
              control={form.control}
              name="sku_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SKU Number</FormLabel>
                   <div className="flex items-center gap-2">
                        <FormControl className="flex-1">
                            <PrefixedInput prefix={formCountry === 'United Kingdom' ? 'UK' : 'CH'} {...field} disabled={notSkuRelated || isDisabled} />
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
                                showError("Enter SKU first.");
                            }
                            }}
                            disabled={notSkuRelated || isDisabled}
                        >
                            <Search className="h-4 w-4" />
                        </Button>
                   </div>
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
                        disabled={isDisabled}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Not SKU Related
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />

            <FormField
              control={form.control}
              name="lease_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lease ID</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isDisabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="supplier_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier Address</FormLabel>
                  <FormControl>
                    <Textarea {...field} disabled={isDisabled} />
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
                        <FormLabel>Sort Code</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            onChange={(e) => {
                                console.log("PaymentRequestEditFormCard: Sort Code onChange fired. Value:", e.target.value);
                                let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
                                if (value.length > 6) value = value.substring(0, 6); // Max 6 digits
                                if (value.length > 4) value = value.slice(0, 2) + '-' + value.slice(2, 4) + '-' + value.slice(4);
                                else if (value.length > 2) value = value.slice(0, 2) + '-' + value.slice(2);
                                field.onChange(value);
                            }}
                            disabled={isDisabled}
                            readOnly={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="account_number"
                    render={({ field }) => {
                      console.log(`[PaymentRequestEditFormCard] Account Number field.value BEFORE render: "${field.value}"`);
                      const currentDisabledState = isDisabled;
                      console.log(`[PaymentRequestEditFormCard] Account Number disabled state: ${currentDisabledState}`);
                      return (
                        <FormItem>
                          <FormLabel>Account Number</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              value={field.value || ''}
                              onChange={(e) => {
                                console.log("PaymentRequestEditFormCard: Account Number onChange fired. Input value:", e.target.value);
                                field.onChange(e.target.value);
                              }}
                              disabled={currentDisabledState}
                              readOnly={false}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                  <FormField
                    control={form.control}
                    name="bank_account_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Account Name</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            disabled={isDisabled}
                            readOnly={false}
                          />
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
                                <FormLabel>Bank Account Name</FormLabel>
                                <FormControl>
                                <Input 
                                  {...field} 
                                  disabled={isDisabled}
                                  readOnly={false}
                                />
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
                            <FormLabel>IBAN</FormLabel>
                            <FormControl>
                            <Input 
                              {...field} 
                              disabled={isDisabled}
                              readOnly={false}
                            />
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
                          disabled={isDisabled}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-blue-700">
                          Bank Details Verified
                        </FormLabel>
                        <FormDescription className="text-blue-600">
                           Confirm these bank details are correct.
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
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} disabled={isDisabled} />
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
                  <FormLabel>Date Payment Required</FormLabel>
                  <DatePicker date={field.value} setDate={field.onChange} disabled={isDisabled} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="invoice_pdf"
              render={({ field: { value, onChange, ...fieldProps } }) => (
                <FormItem>
                  <FormLabel>Add New Invoice(s)</FormLabel>
                  <FormControl>
                    <FileInput
                      {...fieldProps}
                      label="Upload Invoice(s)"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={onChange}
                      multiple
                      disabled={isDisabled}
                    />
                  </FormControl>
                  <FormDescription>Uploading new files will append to existing ones.</FormDescription>
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
                      disabled={isDisabled}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Receipt Required</FormLabel>
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
                      disabled={isDisabled}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-red-700">Mark as Urgent</FormLabel>
                  </div>
                </FormItem>
              )}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default PaymentRequestEditFormCard;