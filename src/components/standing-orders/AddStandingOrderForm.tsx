"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { PlusCircle } from 'lucide-react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useCountry } from '@/integrations/supabase/CountryContext';
import { categoryOptions } from '@/lib/constants';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import DatePicker from '@/components/DatePicker';
import PrefixedInput from '@/components/PrefixedInput';
import { Textarea } from '@/components/ui/textarea';

// Helper for days of the month
const daysOfMonth = Array.from({ length: 31 }, (_, i) => String(i + 1));

// Zod schema for adding a new standing order
const addStandingOrderFormSchema = z.object({
  payee: z.string().min(1, "Payee is required."),
  payment_date: z.date({
    required_error: "Payment Start Date is required.",
  }),
  sku: z.string().optional(),
  not_property_related: z.boolean().default(false),
  category: z.string().min(1, "Category is required."),
  account_name: z.string().min(1, "Account Name is required."),
  account_address: z.string().optional(),
  iban_number: z.string().optional(),
  sort_code: z.string().optional(),
  account_number: z.string().optional(),
  from_day: z.string().min(1, "From Day is required.").refine(val => parseInt(val) >= 1 && parseInt(val) <= 31, "Invalid day."),
  to_day: z.string().min(1, "To Day is required.").refine(val => parseInt(val) >= 1 && parseInt(val) <= 31, "Invalid day."),
  payment_reference: z.string().min(1, "Payment Reference is required."),
  status: z.enum(['active', 'cancelled', 'paused'], {
    required_error: "Status is required.",
  }).default('active'),
  country: z.string().min(1, "Country is required."),
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

  // Accruals period validation
  if (parseInt(data.from_day) > parseInt(data.to_day)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "'From Day' cannot be after 'To Day'.",
      path: ['from_day'],
    });
  }
});

interface AddStandingOrderFormProps {
  onStandingOrderAdded: () => void;
}

const AddStandingOrderForm: React.FC<AddStandingOrderFormProps> = ({ onStandingOrderAdded }) => {
  const { user, userProfile } = useSession();
  const { currentCountry, availableCountries, isCountryLocked } = useCountry();

  const form = useForm<z.infer<typeof addStandingOrderFormSchema>>({
    resolver: zodResolver(addStandingOrderFormSchema),
    defaultValues: {
      payee: "",
      payment_date: undefined,
      sku: currentCountry === 'United Kingdom' ? 'UK' : 'CH',
      not_property_related: false,
      category: "",
      account_name: "",
      account_address: "",
      iban_number: "",
      sort_code: "",
      account_number: "",
      from_day: "1", // Default to 1st day
      to_day: "31", // Default to 31st day
      payment_reference: "",
      status: "active",
      country: currentCountry === 'all' ? 'Switzerland' : currentCountry, // Default to Switzerland if 'all' is selected
    },
  });

  const notPropertyRelated = form.watch("not_property_related");
  const formCountry = form.watch("country");
  const isAdmin = userProfile?.role === 'admin';

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
    }));
  }, [currentCountry, form]);

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
          sku: values.not_property_related ? null : values.sku,
          not_property_related: values.not_property_related,
          category: values.category,
          account_name: values.account_name,
          ...bankDetails,
          from_day: parseInt(values.from_day),
          to_day: parseInt(values.to_day),
          payment_reference: values.payment_reference,
          status: values.status,
          country: values.country,
        });

      if (insertError) {
        throw new Error(`Failed to create standing order: ${insertError.message}`);
      }

      dismissToast(toastId);
      showSuccess("Standing Order added successfully!");
      form.reset({
        payee: "",
        payment_date: undefined,
        sku: formCountry === 'United Kingdom' ? 'UK' : 'CH',
        not_property_related: false,
        category: "",
        account_name: "",
        account_address: "",
        iban_number: "",
        sort_code: "",
        account_number: "",
        from_day: "1",
        to_day: "31",
        payment_reference: "",
        status: "active",
        country: formCountry,
      });
      onStandingOrderAdded();
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred.");
      console.error("Error adding new standing order:", error);
    }
  };

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
                <FormControl> {/* Corrected: FormControl without asChild */}
                  <SelectTrigger id={field.name}>
                    <SelectValue placeholder="Select a country" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {availableCountries.filter(c => c.value !== 'all').map((country) => ( // Filter out 'All Countries'
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
                <Input placeholder="e.g., Rent Co." {...field} disabled={!isAdmin} />
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
                  disabled={!isAdmin}
                />
              </FormControl>
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
                <PrefixedInput prefix={formCountry === 'United Kingdom' ? 'UK' : 'CH'} placeholder="e.g., 12345" {...field} disabled={notPropertyRelated || !isAdmin} />
              </FormControl>
              <FormDescription>
                {notPropertyRelated ? "SKU field is optional as 'Not Property Related' is checked." : `SKU must start with '${formCountry === 'United Kingdom' ? 'UK' : 'CH'}' and be followed by numbers.`}
              </FormDescription>
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
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Category<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!isAdmin}>
                <FormControl> {/* Corrected: FormControl without asChild */}
                  <SelectTrigger id={field.name}>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categoryOptions.map((option) => (
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
                      disabled={!isAdmin}
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

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="from_day"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Accruals Period From Day<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={!isAdmin}>
                  <FormControl> {/* Corrected: FormControl without asChild */}
                    <SelectTrigger id={field.name}>
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                  </FormControl>
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
                  <FormControl> {/* Corrected: FormControl without asChild */}
                    <SelectTrigger id={field.name}>
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                  </FormControl>
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
              <FormLabel className="font-semibold">Payment Reference<span className="text-red-600 ml-1 text-lg font-bold">*</span></FormLabel>
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
                <FormControl> {/* Corrected: FormControl without asChild */}
                  <SelectTrigger id={field.name}>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || !isAdmin}> {/* Disabled for non-admins */}
          <PlusCircle className="mr-2 h-4 w-4" />
          {form.formState.isSubmitting ? "Adding Standing Order..." : "Add Standing Order"}
        </Button>
      </form>
    </Form>
  );
};

export default AddStandingOrderForm;