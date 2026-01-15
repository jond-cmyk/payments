"use client";

import React from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PaymentRequest, PaymentRequestCategoryItem } from '@/types/supabase';
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
import { showError } from '@/utils/toast';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

interface PaymentRequestEditFormCardProps {
  request: PaymentRequest;
  handleRequesterEditSubmit: (values: EditFormSchema) => Promise<void>;
}

const PaymentRequestEditFormCard: React.FC<PaymentRequestEditFormCardProps> = ({ request, handleRequesterEditSubmit }) => {
  const { userProfile } = useSession();
  const isAdmin = userProfile?.role === 'admin';

  const defaultSkuPrefix = request.country === 'United Kingdom' ? 'UK' : 'CH';

  const formattedCategories = request.categories && request.categories.length > 0
    ? request.categories.map(c => ({
        ...c,
        sku: c.sku || defaultSkuPrefix,
        not_sku_related: c.not_sku_related || false
      }))
    : [{ category: "", amount: 0, sku: defaultSkuPrefix, not_sku_related: false }];

  const form = useForm<EditFormSchema>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      supplier_name: request.supplier_name,
      lease_id: request.lease_id || '',
      supplier_address: request.supplier_address,
      iban_number: request.iban_number || '',
      sort_code: request.sort_code || '',
      account_number: request.account_number || '',
      bank_account_name: request.bank_account_name || '',
      currency: request.currency || (request.country === 'United Kingdom' ? 'GBP' : 'CHF'),
      total_amount: request.total_amount,
      notes: request.reason_for_payment || '',
      date_payment_required: new Date(request.date_payment_required),
      receipt_required: request.receipt_required || false,
      is_urgent: request.is_urgent || false,
      country: request.country,
      categories: formattedCategories as any,
      bank_details_verified: request.bank_details_verified || false,
      invoice_pdf: undefined,
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
      form.setValue("total_amount", newTotal);
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
                   <Select onValueChange={field.onChange} value={field.value} disabled={true}>
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

             <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold flex items-center">
                    <DollarSign className="mr-2 h-5 w-5" /> Charges & Properties
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ category: "", amount: 0, sku: defaultSkuPrefix, not_sku_related: false })}
                    className="shadow-sm"
                    disabled={isDisabled}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Line Item
                  </Button>
                </div>
                
                {fields.map((item, index) => (
                  <Card key={item.id} className="p-4 shadow-sm border-2 border-muted">
                    <div className="flex justify-between items-center mb-4">
                      <Badge variant="outline">Item #{index + 1}</Badge>
                      {fields.length > 1 && !isDisabled && (
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
                            <Select onValueChange={field.onChange} value={field.value} disabled={isDisabled}>
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
                          <FormItem>
                            <FormLabel className="font-semibold">Amount<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                            <FormControl>
                              <Input 
                                type="number"
                                step="0.01" 
                                placeholder="0.00" 
                                {...field}
                                disabled={isDisabled}
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
                                  <PrefixedInput prefix={formCountry === 'United Kingdom' ? 'UK' : 'CH'} placeholder="e.g., 12345" {...field} disabled={isNoSku || isDisabled} />
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
                                  disabled={isNoSku || isDisabled}
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
                            <FormItem className="flex flex-row items-start space-x-2 space-y-0 p-2 border rounded-md">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  disabled={isDisabled}
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
                      <div className="mt-4 pt-4 border-t">
                        <PropertyAddressField skuValue={watchedCategories[index].sku} country={formCountry} />
                      </div>
                    )}
                  </Card>
                ))}
                
                <div className="bg-muted p-4 rounded-md flex justify-between items-center text-lg font-bold mt-6">
                  <span>Total Amount:</span>
                  <span>{form.watch('total_amount').toFixed(2)} {request.currency}</span>
                </div>
              </div>

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
                            disabled={isDisabled}
                          />
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
                        <FormLabel>Account Number</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            disabled={isDisabled}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
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
                        <FormLabel className="text-blue-700 font-bold">
                          Bank Details Verified
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
                  <FormLabel>General Notes</FormLabel>
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
                      <FormLabel>
                        Payment Receipt Required?
                      </FormLabel>
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
                      <FormLabel className="text-red-700 font-bold">
                        Mark as Urgent
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full bg-dyad-blue hover:bg-dyad-blue-foreground text-dyad-blue-foreground">
                Submit Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
  );
};

export default PaymentRequestEditFormCard;