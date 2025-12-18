"use client";

import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';
import { Textarea } from '@/components/ui/textarea';
import DatePicker from '@/components/DatePicker';
import { Checkbox } from '@/components/ui/checkbox';
import PrefixedInput from '@/components/PrefixedInput';
import PropertyAddressField from '@/components/PropertyAddressField';
import { PlusCircle, MinusCircle, Search, DollarSign } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const formSchema = z.object({
  payee: z.string().min(1, "Payee is required"),
  sku: z.string().optional(),
  not_property_related: z.boolean().default(false),
  categories: z.array(z.object({
    category: z.string().min(1, "Category is required."),
    amount: z.coerce.number().min(0.01, "Amount must be positive."),
  })).min(1, "At least one category with an amount is required."),
  total_amount: z.coerce.number(),
  payment_date: z.date({
    required_error: "Start date is required",
  }),
  payment_end_date: z.date().optional(),
  agreement_end_date: z.date().optional(),
  payment_reference: z.string().min(1, "Payment reference is required"),
  country: z.string().min(1, "Country is required"),
  currency: z.string().min(1, "Currency is required"),
  account_name: z.string().optional(),
  account_address: z.string().optional(),
  iban_number: z.string().optional(),
  sort_code: z.string().optional(),
  account_number: z.string().optional(),
  payment_day: z.number().min(1).max(31).optional(),
}).superRefine((data, ctx) => {
    const skuPrefix = data.country === 'United Kingdom' ? 'UK' : 'CH';
    if (!data.not_property_related) {
        if (!data.sku || data.sku.trim() === '') {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `SKU is required unless 'Not Property Related' is checked.`, path: ['sku'] });
        } else if (!data.sku.startsWith(skuPrefix)) {
             ctx.addIssue({ code: z.ZodIssueCode.custom, message: `SKU must start with '${skuPrefix}'.`, path: ['sku'] });
        }
    }
    
    if (data.country === 'United Kingdom') {
        if (!data.sort_code || !/^\d{2}-\d{2}-\d{2}$/.test(data.sort_code)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sort Code is required (XX-XX-XX).", path: ['sort_code'] });
        }
        if (!data.account_number || !/^\d{8}$/.test(data.account_number?.replace(/\s/g, '') || '')) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Account Number must be 8 digits.", path: ['account_number'] });
        }
    } else {
         if (!data.iban_number) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "IBAN is required.", path: ['iban_number'] });
        }
    }
});

interface AddStandingOrderFormProps {
  onStandingOrderAdded: () => void;
}

const AddStandingOrderForm: React.FC<AddStandingOrderFormProps> = ({ onStandingOrderAdded }) => {
  const { userProfile } = useSession();
  const { currentCountry, isCountryLocked, availableCountries } = useCountry();
  
  const isAdmin = userProfile?.role === 'admin';

  const defaultSkuPrefix = currentCountry === 'United Kingdom' ? 'UK' : 'CH';
  const initialCurrency = currentCountry === 'United Kingdom' ? 'GBP' : 'CHF';

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      payee: "",
      sku: defaultSkuPrefix,
      not_property_related: false,
      categories: [{ category: "", amount: 0 }],
      total_amount: 0,
      payment_reference: "",
      country: currentCountry,
      currency: initialCurrency,
      account_name: "",
      account_address: "",
      iban_number: "",
      sort_code: "",
      account_number: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "categories",
  });

  const notPropertyRelated = form.watch("not_property_related");
  const formCountry = form.watch("country");
  const skuValue = form.watch("sku");
  const watchedCategories = useWatch({
      control: form.control,
      name: "categories",
  });

   // Calculate total amount whenever categories array changes
  useEffect(() => {
    const newTotal = (watchedCategories || []).reduce((sum, categoryItem) => {
      const parsedAmount = parseFloat(categoryItem?.amount as any) || 0;
      return sum + parsedAmount;
    }, 0);
    if (form.getValues('total_amount') !== newTotal) {
      form.setValue("total_amount", newTotal);
    }
  }, [watchedCategories, form]);


  // Reset defaults on country change
  useEffect(() => {
    const newSkuPrefix = formCountry === 'United Kingdom' ? 'UK' : 'CH';
    const newCurrency = formCountry === 'United Kingdom' ? 'GBP' : 'CHF';
    form.setValue('sku', newSkuPrefix);
    form.setValue('currency', newCurrency);
    form.setValue('sort_code', '');
    form.setValue('account_number', '');
    form.setValue('iban_number', '');
  }, [formCountry, form]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const toastId = showLoading("Creating standing order...");
    try {
      // Calculate payment day from start date if not explicitly set
      const paymentDay = values.payment_date.getDate();

      const { error } = await supabase.from('standing_orders').insert({
        payee: values.payee,
        sku: values.not_property_related ? null : values.sku,
        not_property_related: values.not_property_related,
        categories: values.categories,
        total_amount: values.total_amount,
        payment_date: values.payment_date.toISOString().split('T')[0],
        payment_end_date: values.payment_end_date ? values.payment_end_date.toISOString().split('T')[0] : null,
        agreement_end_date: values.agreement_end_date ? values.agreement_end_date.toISOString().split('T')[0] : null,
        payment_reference: values.payment_reference,
        country: values.country,
        currency: values.currency,
        account_name: values.account_name,
        account_address: values.account_address,
        iban_number: values.country !== 'United Kingdom' ? values.iban_number : null,
        sort_code: values.country === 'United Kingdom' ? values.sort_code : null,
        account_number: values.country === 'United Kingdom' ? values.account_number?.replace(/\s/g, '') : null,
        payment_day: paymentDay,
        status: 'pending', 
      });

      if (error) throw error;

      dismissToast(toastId);
      showSuccess("Standing order created successfully!");
      onStandingOrderAdded();
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to create standing order.");
    }
  };

  const filteredCategoryOptions = categoryOptions.filter(option =>
    !option.countries || option.countries.includes(formCountry)
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, (errors) => console.error("Form validation failed:", errors))} className="space-y-4">
        <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Country</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={isCountryLocked}>
                    <SelectTrigger>
                    <FormControl>
                        <SelectValue placeholder="Select country" />
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
          name="payee"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payee</FormLabel>
              <FormControl>
                <Input placeholder="Payee Name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
                        <Select onValueChange={field.onChange} value={field.value}>
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
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Category
                </Button>
                <Separator className="my-4" />
                <div className="flex justify-between items-center text-lg font-bold">
                <span>Total Amount:</span>
                <span>{form.getValues('total_amount').toFixed(2)}</span>
                </div>
            </div>
        </Card>

        {formCountry !== 'United Kingdom' && (
             <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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
        )}
        {formCountry === 'United Kingdom' && (
             <div className="space-y-2">
                <FormLabel>Currency</FormLabel>
                <Input value="GBP" disabled className="bg-muted/50" />
            </div>
        )}

        <FormField
          control={form.control}
          name="sku"
          render={({ field }) => (
            <FormItem>
              <FormLabel>SKU</FormLabel>
              <div className="flex items-center gap-2">
                <FormControl className="flex-1">
                  <PrefixedInput prefix={formCountry === 'United Kingdom' ? 'UK' : 'CH'} {...field} disabled={notPropertyRelated} />
                </FormControl>
                 <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                        const sku = form.getValues('sku');
                        if (sku) {
                        const url = `https://portal.kassoehousing.com/admin/kassoe-theme/categories/edit/115?_method=PUT&Filter%5BKassoeThemeProducts__sku%5D=${encodeURIComponent(sku)}`;
                        window.open(url, '_blank');
                        } else {
                        showError("Enter SKU first.");
                        }
                    }}
                    disabled={notPropertyRelated}
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
          name="not_property_related"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Not Property Related</FormLabel>
              </div>
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
            control={form.control}
            name="payment_date"
            render={({ field }) => (
                <FormItem className="flex flex-col">
                <FormLabel>Start Date</FormLabel>
                <DatePicker date={field.value} setDate={field.onChange} />
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={form.control}
            name="payment_end_date"
            render={({ field }) => (
                <FormItem className="flex flex-col">
                <FormLabel>End Date (Bank)</FormLabel>
                <DatePicker date={field.value} setDate={field.onChange} />
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
            control={form.control}
            name="agreement_end_date"
            render={({ field }) => (
                <FormItem className="flex flex-col">
                <FormLabel>End Date (Contract)</FormLabel>
                <DatePicker date={field.value} setDate={field.onChange} />
                <FormMessage />
                </FormItem>
            )}
            />
             <FormField
                control={form.control}
                name="payment_reference"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Payment Reference</FormLabel>
                    <FormControl>
                        <Input placeholder="Reference" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>

         <FormField
          control={form.control}
          name="account_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Name</FormLabel>
              <FormControl>
                <Input placeholder="Account Holder Name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="account_address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account Address</FormLabel>
              <FormControl>
                <Textarea placeholder="Address" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {formCountry !== 'United Kingdom' ? (
             <FormField
                control={form.control}
                name="iban_number"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>IBAN</FormLabel>
                    <FormControl>
                        <Input placeholder="IBAN" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
        ) : (
            <>
                <FormField
                    control={form.control}
                    name="sort_code"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Sort Code</FormLabel>
                        <FormControl>
                             <Input
                                placeholder="XX-XX-XX"
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
                        <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="account_number"
                    render={({ field }) => {
                      console.log(`[AddStandingOrderForm] Account Number field.value BEFORE render: "${field.value}"`);
                      const currentDisabledState = form.formState.isSubmitting;
                      console.log(`[AddStandingOrderForm] Account Number disabled state: ${currentDisabledState}`);
                      return (
                        <FormItem>
                          <FormLabel>Account Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="1234 5678"
                              {...field}
                              value={field.value || ''}
                              onChange={(e) => {
                                console.log("AddStandingOrderForm: Account Number onChange fired. Input value:", e.target.value);
                                field.onChange(e.target.value);
                              }}
                              disabled={currentDisabledState}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                />
            </>
        )}

        <Button type="submit" className="w-full">Create Standing Order</Button>
      </form>
    </Form>
  );
};

export default AddStandingOrderForm;