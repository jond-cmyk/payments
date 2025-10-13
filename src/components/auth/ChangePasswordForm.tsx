"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { KeyRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// Zod schema for password change form
const changePasswordFormSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters long"),
  confirmPassword: z.string().min(6, "Confirmation password must be at least 6 characters long"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

interface ChangePasswordFormProps {
  onPasswordChanged?: () => void;
}

const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({ onPasswordChanged }) => {
  const form = useForm<z.infer<typeof changePasswordFormSchema>>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof changePasswordFormSchema>) => {
    const toastId = showLoading("Updating password...");

    try {
      const { data, error } = await supabase.auth.updateUser({
        password: values.password,
      });

      if (error) {
        throw new Error(error.message);
      }

      dismissToast(toastId);
      showSuccess("Password updated successfully!");
      form.reset();
      onPasswordChanged?.();
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to update password.");
      console.error("Change password error:", error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm New Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          <KeyRound className="mr-2 h-4 w-4" />
          {form.formState.isSubmitting ? "Updating Password..." : "Change Password"}
        </Button>
      </form>
    </Form>
  );
};

export default ChangePasswordForm;