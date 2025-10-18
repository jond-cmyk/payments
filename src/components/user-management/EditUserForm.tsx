"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Profile } from '@/types/supabase';
import { User } from '@supabase/supabase-js';
import { UserCheck } from 'lucide-react';
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

// Zod schema for editing a user's profile
const editUserFormSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  role: z.enum(['requester', 'admin'], {
    required_error: "Role is required",
  }),
  is_approved: z.boolean().default(false),
  country: z.string().min(1, "Country is required"), // New country field
});

interface EditUserFormProps {
  profile: Profile;
  currentUser: User | null;
  onSave: (values: z.infer<typeof editUserFormSchema>) => Promise<void>;
  isSaving: boolean;
}

const EditUserForm: React.FC<EditUserFormProps> = ({ profile, currentUser, onSave, isSaving }) => {
  const { availableCountries } = useCountry(); // Use availableCountries from context

  const form = useForm<z.infer<typeof editUserFormSchema>>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: {
      first_name: profile.first_name || "",
      last_name: profile.last_name || "",
      role: profile.role,
      is_approved: profile.is_approved,
      country: profile.country || "Switzerland", // Set default from profile or 'Switzerland'
    },
  });

  // NEW LOG: Log initial profile.is_approved and form's default is_approved
  React.useEffect(() => {
    console.log(`[EditUserForm] Initial profile.is_approved: ${profile.is_approved}`);
    console.log(`[EditUserForm] Form default is_approved: ${form.getValues('is_approved')}`);
  }, [profile.is_approved, form]);

  const onSubmit = async (values: z.infer<typeof editUserFormSchema>) => {
    console.log(`[EditUserForm] Submitting form with is_approved: ${values.is_approved}`); // NEW LOG
    await onSave(values);
  };

  // Disable editing role/approval/country for the current logged-in user
  const isCurrentUser = currentUser?.id === profile.id;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="first_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isSaving} />
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
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isSaving} />
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
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSaving || isCurrentUser}>
                <SelectTrigger>
                  <FormControl>
                    <SelectValue placeholder="Select a role" />
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
          name="country"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Country</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSaving || isCurrentUser}>
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
                  onCheckedChange={(checked) => {
                    console.log(`[EditUserForm] Checkbox onCheckedChange: ${checked}`); // NEW LOG
                    field.onChange(checked);
                  }}
                  disabled={isSaving || isCurrentUser}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  Approved
                </FormLabel>
                <p className="text-sm text-muted-foreground">
                  Check this box to approve the user, allowing them to access the application.
                </p>
              </div>
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isSaving}>
          <UserCheck className="mr-2 h-4 w-4" />
          {isSaving ? "Saving Changes..." : "Save Changes"}
        </Button>
      </form>
    </Form>
  );
};

export default EditUserForm;