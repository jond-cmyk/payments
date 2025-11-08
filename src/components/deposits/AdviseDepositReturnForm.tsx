"use client";

import React from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, MinusCircle, Send } from 'lucide-react';
import { categoryOptions } from '@/lib/constants';
import { formatAmount } from '@/components/economic/EconomicDetailDialog';

const formSchema = z.object({
  sku: z.string(),
  country: z.string(),
  total_deposit: z.number(),
  currency: z.string(),
  deductions: z.array(z.object({
    category: z.string().min(1, "Category is required."),
    amount: z.coerce.number().min(0.01, "Amount must be positive."),
  })).optional(),
  notes: z.string().optional(),
});

type AdviseDepositReturnFormValues = z.infer<typeof formSchema>;

interface AdviseDepositReturnFormProps {
  sku: string;
  country: string;
  totalDeposit: number;
  currency: string;
  onSubmit: (values: AdviseDepositReturnFormValues & { expected_refund: number }) => Promise<void>;
  isSubmitting: boolean;
}

const AdviseDepositReturnForm: React.FC<AdviseDepositReturnFormProps> = ({ sku, country, totalDeposit, currency, onSubmit, isSubmitting }) => {
  const form = useForm<AdviseDepositReturnFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sku,
      country,
      total_deposit: totalDeposit,
      currency,
      deductions: [],
      notes: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "deductions",
  });

  const watchedDeductions = useWatch({
    control: form.control,
    name: "deductions",
  });

  const totalDeductions = React.useMemo(() => {
    return (watchedDeductions || []).reduce((sum, item) => {
      const parsedAmount = parseFloat(item?.amount as any) || 0;
      return sum + parsedAmount;
    }, 0);
  }, [watchedDeductions]);

  const expectedRefund = totalDeposit - totalDeductions;

  const handleFormSubmit = (values: AdviseDepositReturnFormValues) => {
    onSubmit({ ...values, expected_refund: expectedRefund });
  };

  const filteredCategoryOptions = categoryOptions.filter(option =>
    !option.countries || option.countries.includes(country)
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="sku"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SKU</FormLabel>
                <FormControl>
                  <Input {...field} readOnly className="bg-muted" />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country</FormLabel>
                <FormControl>
                  <Input {...field} readOnly className="bg-muted" />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md text-center">
          <p className="text-sm font-medium text-blue-700">Total Deposit Held</p>
          <p className="text-2xl font-bold text-blue-900">{formatAmount(totalDeposit)} {currency}</p>
        </div>

        <div>
          <FormLabel className="font-semibold">Deductions</FormLabel>
          <div className="space-y-4 mt-2 p-4 border rounded-md">
            {fields.map((item, index) => (
              <div key={item.id} className="flex items-end gap-2">
                <FormField
                  control={form.control}
                  name={`deductions.${index}.category`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel className={index === 0 ? "" : "sr-only"}>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
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
                  name={`deductions.${index}.amount`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className={index === 0 ? "" : "sr-only"}>Amount</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="Amount" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="button" variant="outline" size="icon" onClick={() => remove(index)}>
                  <MinusCircle className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => append({ category: "", amount: 0 })} className="w-full">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Deduction
            </Button>
          </div>
        </div>

        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-center">
          <p className="text-sm font-medium text-yellow-700">Total Deductions</p>
          <p className="text-xl font-bold text-yellow-900">{formatAmount(totalDeductions)} {currency}</p>
        </div>

        <div className="p-4 bg-green-50 border border-green-200 rounded-md text-center">
          <p className="text-sm font-medium text-green-700">Expected Refund</p>
          <p className="text-2xl font-bold text-green-900">{formatAmount(expectedRefund)} {currency}</p>
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Add any relevant notes for the admin..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          <Send className="mr-2 h-4 w-4" />
          {isSubmitting ? "Submitting..." : "Advise of Deposit Return"}
        </Button>
      </form>
    </Form>
  );
};

export default AdviseDepositReturnForm;