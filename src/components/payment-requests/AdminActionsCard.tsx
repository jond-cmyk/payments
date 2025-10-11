"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CheckCircle, XCircle, DollarSign, MessageSquare, Trash2 } from 'lucide-react';
import { UseMutationResult } from '@tanstack/react-query';
import { User } from '@supabase/supabase-js';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PaymentRequest } from '@/types/supabase';

// Zod schema for admin decline reason
const declineFormSchema = z.object({
  admin_action_reason: z.string().min(1, "Decline reason is required"),
});

// Zod schema for admin query note
const queryFormSchema = z.object({
  query_note: z.string().min(1, "Query note is required"),
});

interface AdminActionsCardProps {
  request: PaymentRequest;
  isAdmin: boolean;
  updateRequestMutation: UseMutationResult<boolean, Error, Partial<PaymentRequest> & { new_invoice_files?: FileList }, unknown>;
  deleteRequestMutation: UseMutationResult<boolean, Error, void, unknown>;
  handleAdminAction: (status: 'setup_awaiting_approval' | 'approved' | 'declined' | 'queried', reason?: string) => Promise<boolean>; // Updated return type
  handleAdminQuery: (values: z.infer<typeof queryFormSchema>) => Promise<boolean>; // Updated return type
  user: User | null;
}

const AdminActionsCard: React.FC<AdminActionsCardProps> = ({
  request,
  isAdmin,
  updateRequestMutation,
  deleteRequestMutation,
  handleAdminAction,
  handleAdminQuery,
  user,
}) => {
  const declineForm = useForm<z.infer<typeof declineFormSchema>>({
    resolver: zodResolver(declineFormSchema),
    defaultValues: {
      admin_action_reason: "",
    },
  });

  const queryForm = useForm<z.infer<typeof queryFormSchema>>({
    resolver: zodResolver(queryFormSchema),
    defaultValues: {
      query_note: "",
    },
  });

  const onQueryFormSubmit = async (values: z.infer<typeof queryFormSchema>) => {
    try {
      const success = await handleAdminQuery(values);
      if (success) {
        queryForm.reset(); // Reset the form on successful submission
      }
    } catch (error) {
      // Error handling is done in handleAdminQuery, just catch here to prevent app crash
      console.error("Error during query form submission:", error);
    }
  };

  if (!isAdmin || request.status === 'declined') {
    return null;
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Admin Actions</CardTitle>
        <CardDescription>Manage this payment request.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4">
        {(request.status === 'pending' || request.status === 'queried') && (
          <Button
            onClick={() => handleAdminAction('setup_awaiting_approval')}
            disabled={updateRequestMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <DollarSign className="mr-2 h-4 w-4" /> Setup Payment
          </Button>
        )}

        {(request.status === 'pending' || request.status === 'setup_awaiting_approval') && (
          <AlertDialog>
            <AlertDialogTrigger
              asChild
            >
              <Button
                variant="outline"
                disabled={updateRequestMutation.isPending}
                className="text-gray-600 border-gray-600 hover:bg-gray-50"
              >
                <MessageSquare className="mr-2 h-4 w-4" /> Query Payment
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Query Payment Request</AlertDialogTitle>
                <AlertDialogDescription>
                  Enter a note for the requester regarding this payment request. The status will be set to 'Queried'.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Form {...queryForm}>
                <form id="query-form" onSubmit={queryForm.handleSubmit(onQueryFormSubmit)} className="space-y-4">
                  <FormField
                    control={queryForm.control}
                    name="query_note"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Query Note</FormLabel>
                        <FormControl>
                          <Textarea placeholder="e.g., Please provide a more detailed reason for payment." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button form="query-form" type="submit">
                    Submit Query
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {request.status === 'setup_awaiting_approval' && (
          <Button
            onClick={() => handleAdminAction('approved')}
            disabled={updateRequestMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle className="mr-2 h-4 w-4" /> Approve Payment
          </Button>
        )}

        {(request.status === 'pending' || request.status === 'setup_awaiting_approval' || request.status === 'queried') && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={updateRequestMutation.isPending}
              >
                <XCircle className="mr-2 h-4 w-4" /> Decline Payment
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Decline Payment Request</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to decline this payment request? Please provide a reason.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Form {...declineForm}>
                <form id="decline-form" onSubmit={declineForm.handleSubmit((data) => handleAdminAction('declined', data.admin_action_reason))} className="space-y-4">
                  <FormField
                    control={declineForm.control}
                    name="admin_action_reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reason for Decline</FormLabel>
                        <FormControl>
                          <Textarea placeholder="e.g., Insufficient budget, incorrect details" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button form="decline-form" type="submit" variant="destructive">
                    Decline
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="text-red-500 border-red-500 hover:bg-red-50"
              disabled={deleteRequestMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete Request
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the payment request and remove its data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteRequestMutation.mutate()} asChild>
                <Button variant="destructive">
                  Delete
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

export default AdminActionsCard;