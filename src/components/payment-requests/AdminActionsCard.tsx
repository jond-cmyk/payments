"use client";

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { CheckCircle, XCircle, DollarSign, MessageSquare, Trash2, RotateCcw, BellRing, Ban } from 'lucide-react'; // Import Ban icon
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

// Zod schema for admin revert reason - NEW
const revertFormSchema = z.object({
  revert_reason: z.string().min(1, "Revert reason is required"),
});

interface AdminActionsCardProps {
  request: PaymentRequest;
  isAdmin: boolean;
  updateRequestMutation: UseMutationResult<boolean, Error, Partial<PaymentRequest> & { new_invoice_files?: FileList }, unknown>;
  deleteRequestMutation: UseMutationResult<boolean, Error, void, unknown>;
  handleAdminAction: (status: 'setup_awaiting_approval' | 'approved' | 'declined' | 'queried' | 'reverted_to_pending' | 'cancelled', reason?: string) => Promise<boolean>; // Updated return type
  handleAdminQuery: (values: z.infer<typeof queryFormSchema>) => Promise<boolean>;
  handleAdminRevert: (values: z.infer<typeof revertFormSchema>) => Promise<boolean>; // New prop for revert handler
  handleSendReminder: () => Promise<void>; // NEW: Prop for sending reminder
  isSendingReminder: boolean; // NEW: Prop for reminder loading state
  user: User | null;
}

const AdminActionsCard: React.FC<AdminActionsCardProps> = ({
  request,
  isAdmin,
  updateRequestMutation,
  deleteRequestMutation,
  handleAdminAction,
  handleAdminQuery,
  handleAdminRevert, // Destructure new prop
  handleSendReminder, // Destructure new prop
  isSendingReminder, // Destructure new prop
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

  const revertForm = useForm<z.infer<typeof revertFormSchema>>({ // NEW: Form for revert reason
    resolver: zodResolver(revertFormSchema),
    defaultValues: {
      revert_reason: "",
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

  const onRevertFormSubmit = async (values: z.infer<typeof revertFormSchema>) => { // NEW: Submit handler for revert
    try {
      const success = await handleAdminRevert(values);
      if (success) {
        revertForm.reset(); // Reset the form on successful submission
      }
    } catch (error) {
      console.error("Error during revert form submission:", error);
    }
  };

  // Reminder button visibility: any authenticated user, if status is pending or setup_awaiting_approval
  const showReminderButton = !!user && (request.status === 'pending' || request.status === 'setup_awaiting_approval');
  const showCancelButton = !!user && (request.status === 'pending' || request.status === 'queried');

  if (!isAdmin && !showReminderButton && !showCancelButton) { // Only hide if not admin AND no reminder/cancel button
    return null;
  }

  return (
    <Card className="mb-8 shadow-sm"> {/* Added shadow-sm */}
      <CardHeader>
        <CardTitle>Admin Actions</CardTitle>
        <CardDescription>Manage this payment request.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4">
        {(request.status === 'pending' || request.status === 'queried') && isAdmin && ( // Only admins can setup payment
          <Button
            onClick={() => handleAdminAction('setup_awaiting_approval')}
            disabled={updateRequestMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm" // Added shadow-sm
          >
            <DollarSign className="mr-2 h-4 w-4" /> Setup Payment
          </Button>
        )}

        {(request.status === 'pending' || request.status === 'setup_awaiting_approval') && isAdmin && ( // Only admins can query payment
          <AlertDialog>
            <AlertDialogTrigger
              asChild
            >
              <Button
                variant="default"
                disabled={updateRequestMutation.isPending}
                className="bg-gray-500 hover:bg-gray-600 text-white shadow-sm" // Added shadow-sm
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

        {request.status === 'setup_awaiting_approval' && isAdmin && ( // Only admins can approve payment
          <Button
            onClick={() => handleAdminAction('approved')}
            disabled={updateRequestMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white shadow-sm" // Added shadow-sm
          >
            <CheckCircle className="mr-2 h-4 w-4" /> Approve Payment
          </Button>
        )}

        {(request.status === 'pending' || request.status === 'setup_awaiting_approval' || request.status === 'queried') && isAdmin && ( // Only admins can decline payment
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={updateRequestMutation.isPending}
                className="shadow-sm" // Added shadow-sm
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

        {/* NEW: Cancel Request Button */}
        {showCancelButton && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="text-orange-500 border-orange-500 hover:bg-orange-50 shadow-sm"
                disabled={updateRequestMutation.isPending}
              >
                <Ban className="mr-2 h-4 w-4" /> Cancel Request
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to cancel?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will cancel the payment request. This action can be reverted by an administrator later if needed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Back</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleAdminAction('cancelled')} asChild>
                  <Button variant="destructive">
                    Confirm Cancel
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* NEW: Revert to Pending Button */}
        {request.status !== 'pending' && isAdmin && ( // Only admins can revert
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="text-orange-500 border-orange-500 hover:bg-orange-50 shadow-sm" // Added shadow-sm
                disabled={updateRequestMutation.isPending}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Revert to Pending
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revert Payment Request to Pending</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to revert this payment request to 'Pending' status? Please provide a reason.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Form {...revertForm}>
                <form id="revert-form" onSubmit={revertForm.handleSubmit(onRevertFormSubmit)} className="space-y-4">
                  <FormField
                    control={revertForm.control}
                    name="revert_reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reason for Revert</FormLabel>
                        <FormControl>
                          <Textarea placeholder="e.g., More information needed from requester, incorrect setup" {...field} />
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
                  <Button form="revert-form" type="submit" variant="default">
                    Revert
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* NEW: Send Reminder Button */}
        {showReminderButton && (
          <Button
            onClick={handleSendReminder}
            disabled={isSendingReminder}
            variant="outline"
            className="text-blue-600 border-blue-600 hover:bg-blue-50 shadow-sm"
          >
            <BellRing className="mr-2 h-4 w-4" />
            {isSendingReminder ? "Sending Reminder..." : "Send Reminder"}
          </Button>
        )}

        {isAdmin && ( // Only admins can delete requests
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="text-red-500 border-red-500 hover:bg-red-50 shadow-sm" // Added shadow-sm
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
        )}
      </CardContent>
    </Card>
  );
};

export default AdminActionsCard;