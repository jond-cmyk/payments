"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Feedback } from '@/types/supabase';
import { format } from 'date-fns';
import { MessageSquareText, CheckCircle, MailOpen, Trash2, XCircle } from 'lucide-react';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

const AdminFeedback = () => {
  const { session, isLoading: isSessionLoading, userProfile } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isAdmin = userProfile?.role === 'admin';

  const { data: feedback, isLoading: isFeedbackLoading, error: feedbackError } = useQuery<Feedback[]>({
    queryKey: ['allFeedback'],
    queryFn: async () => {
      if (!isAdmin) return [];
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (feedbackId: string) => {
      const { error } = await supabase
        .from('feedback')
        .update({ is_read: true, created_at: new Date().toISOString() }) // Update created_at to trigger Realtime
        .eq('id', feedbackId);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allFeedback'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] }); // Invalidate notification count
    },
    onError: (error: any) => {
      showError(error.message || "Failed to mark feedback as read.");
      console.error("Mark feedback as read error:", error);
    },
  });

  const markAsUnreadMutation = useMutation({
    mutationFn: async (feedbackId: string) => {
      const { error } = await supabase
        .from('feedback')
        .update({ is_read: false, created_at: new Date().toISOString() }) // Update created_at to trigger Realtime
        .eq('id', feedbackId);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allFeedback'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] }); // Invalidate notification count
    },
    onError: (error: any) => {
      showError(error.message || "Failed to mark feedback as unread.");
      console.error("Mark feedback as unread error:", error);
    },
  });

  const deleteFeedbackMutation = useMutation({
    mutationFn: async (feedbackId: string) => {
      const { error } = await supabase
        .from('feedback')
        .delete()
        .eq('id', feedbackId);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allFeedback'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] }); // Invalidate notification count
      showSuccess("Feedback deleted!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete feedback.");
      console.error("Delete feedback error:", error);
    },
  });

  if (isSessionLoading || isFeedbackLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading feedback...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (!isAdmin) {
    showError("You do not have permission to view this page.");
    navigate('/dashboard');
    return null;
  }

  if (feedbackError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading feedback: {feedbackError.message}</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Admin Feedback - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <MessageSquareText className="mr-2 h-6 w-6" /> User Feedback
          </CardTitle>
          <CardDescription>
            Review anonymous feedback submitted by users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feedback && feedback.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type(s)</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feedback.map((item) => (
                    <TableRow key={item.id} className={cn(item.is_read ? 'bg-muted/50' : 'bg-card hover:bg-gradient-to-r hover:from-dyad-blue-light/5 hover:to-background')}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(item.created_at), 'PPP p')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.feedback_types.map((type, index) => (
                            <Badge key={index} variant="secondary" className="bg-gray-200 text-gray-800">
                              {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md truncate">{item.message}</TableCell>
                      <TableCell>
                        {item.is_read ? (
                          <Badge className="bg-green-500 text-green-50">
                            <CheckCircle className="mr-1 h-3 w-3" /> Read
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-500 text-yellow-50">
                            <MailOpen className="mr-1 h-3 w-3" /> Unread
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right flex items-center justify-end space-x-2">
                        {item.is_read ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => markAsUnreadMutation.mutate(item.id)}
                            disabled={markAsUnreadMutation.isPending}
                            className="shadow-sm"
                          >
                            <MailOpen className="h-4 w-4" /> Mark Unread
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => markAsReadMutation.mutate(item.id)}
                            disabled={markAsReadMutation.isPending}
                            className="shadow-sm"
                          >
                            <CheckCircle className="h-4 w-4" /> Mark Read
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-500 border-red-500 hover:bg-red-50 shadow-sm"
                              disabled={deleteFeedbackMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete this feedback submission.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteFeedbackMutation.mutate(item.id)} asChild>
                                <Button variant="destructive">
                                  Delete
                                </Button>
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground mt-8">No feedback submissions found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminFeedback;