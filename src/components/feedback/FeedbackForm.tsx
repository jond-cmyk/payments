"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { MessageSquarePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/integrations/supabase/SessionContext';

// Define feedback types
const feedbackTypeOptions = [
  { id: "new_functions", label: "Request For New Functions" },
  { id: "existing_problems", label: "Problems With Existing Functions" },
  { id: "site_bugs", label: "Site Bugs" },
  { id: "other", label: "Other" },
];

// Zod schema for the feedback form
const feedbackFormSchema = z.object({
  feedback_types: z.array(z.string()).min(1, "Please select at least one feedback type."),
  message: z.string().min(10, "Feedback message must be at least 10 characters long."),
});

interface FeedbackFormProps {
  onFeedbackSubmitted: () => void;
}

const FeedbackForm: React.FC<FeedbackFormProps> = ({ onFeedbackSubmitted }) => {
  const { user } = useSession();

  const form = useForm<z.infer<typeof feedbackFormSchema>>({
    resolver: zodResolver(feedbackFormSchema),
    defaultValues: {
      feedback_types: [],
      message: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof feedbackFormSchema>) => {
    const toastId = showLoading("Submitting feedback...");

    try {
      const { error } = await supabase
        .from('feedback')
        .insert({
          feedback_types: values.feedback_types,
          message: values.message,
          user_id: user?.id || null, // Store user_id but keep display anonymous
        });

      if (error) {
        throw new Error(error.message);
      }

      dismissToast(toastId);
      showSuccess("Thank you for your anonymous feedback!");
      form.reset();
      onFeedbackSubmitted();
    } catch (error: any) {
      dismissToast(toastId);
      showError(error.message || "Failed to submit feedback.");
      console.error("Feedback submission error:", error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="feedback_types"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <FormLabel className="text-base font-semibold">Feedback Type(s)</FormLabel>
                <FormDescription>
                  Select one or more categories that best describe your feedback.
                </FormDescription>
              </div>
              {feedbackTypeOptions.map((item) => (
                <FormField
                  key={item.id}
                  control={form.control}
                  name="feedback_types"
                  render={({ field }) => {
                    return (
                      <FormItem
                        key={item.id}
                        className="flex flex-row items-start space-x-3 space-y-0"
                      >
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(item.id)}
                            onCheckedChange={(checked) => {
                              return checked
                                ? field.onChange([...field.value, item.id])
                                : field.onChange(
                                    field.value?.filter(
                                      (value) => value !== item.id
                                    )
                                  );
                            }}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          {item.label}
                        </FormLabel>
                      </FormItem>
                    );
                  }}
                />
              ))}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Your Feedback</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Tell us what you think..."
                  className="min-h-[120px]"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Please provide as much detail as possible. This feedback is anonymous.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          {form.formState.isSubmitting ? "Submitting..." : "Submit Feedback"}
        </Button>
      </form>
    </Form>
  );
};

export default FeedbackForm;