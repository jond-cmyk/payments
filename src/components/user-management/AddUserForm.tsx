"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { UserPlus } from 'lucide-react';
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Profile } from '@/types/supabase'; // Import Profile type

// Zod schema for adding a new user
const addUserFormSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  role: z.enum(['requester', 'admin'], {
    required_error: "Role is required",
  }),
  is_approved: z.boolean().default(false),
  country: z.string().min(1, "Country is required"), // New country field
});

interface AddUserFormProps {
  onUserAdded: () => void; // Callback to refresh user list and close dialog
}

const roleOptions = [
  { value: 'requester', label: 'Requester' },
  { value: 'admin', label: 'Admin' },
];

const AddUserForm: React.FC<AddUserFormProps> = ({ onUserAdded }) => {
  const { availableCountries } = useCountry(); // Use availableCountries from context

  const form = useForm<z.infer<typeof addUserFormSchema>>({
    resolver: zodResolver(addUserFormSchema),
    defaultValues: {
      email: "",
      password: "",
      first_name: "",
      last_name: "",
      role: "requester",
      is_approved: false,
      country: "Switzerland", // Default to Switzerland
    },
  });

  const onSubmit = async (values: z.infer<typeof addUserFormSchema>) => {
    const toastId = showLoading("Adding new user...");

    try {
      // Invoke the Edge Function to create the user with admin privileges
      const { data, error: invokeError } = await supabase.functions.invoke('create-user', {
        body: values, // Pass all form values to the Edge Function
      });

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      dismissToast(toastId);
      showSuccess(data?.message || `User '${values.email}' added successfully!`);
      form.reset({ country: "Switzerland" }); // Reset with default country
      onUserAdded(); // Call callback to refresh list and close dialog
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "An unexpected error occurred.");
      console.error("Error adding new user:", error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="user@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="first_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name (Optional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="last_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name (Optional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <SelectTrigger>
                  <FormControl>
                    <SelectValue placeholder="Select a role" />
                  </FormControl>
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
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
          name="country"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Country</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
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
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="is_approved"
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
                  Approve User Immediately
                </FormLabel>
                <p className="text-sm text-muted-foreground">
                  If checked, the user will be able to log in and access the application immediately.
                </p>
              </div>
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          <UserPlus className="mr-2 h-4 w-4" />
          {form.formState.isSubmitting ? "Adding User..." : "Add User"}
        </Button>
      </form>
    </Form>
  );
};

export default AddUserForm;