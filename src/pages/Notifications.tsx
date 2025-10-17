"use client";

import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Notification as NotificationType, PaymentRequest } from '@/types/supabase'; // Import NotificationType and PaymentRequest
import { format } from 'date-fns';
import { Bell, CheckCircle, MailOpen, Trash2, XCircle, RotateCcw } from 'lucide-react';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { cleanAndCapitalizeStatus } from '@/utils/formatters'; // Import the new formatter

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import PageTitle from '@/components/PageTitle';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils'; // Import cn for utility classes

// Extend the Notification type to include the payment request status
interface EnrichedNotification extends NotificationType {
  paymentRequestStatus?: PaymentRequest['status'];
}

const NotificationsPage = () => {
  const { session, isLoading: isSessionLoading, user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading: isNotificationsLoading, error: notificationsError } = useQuery<EnrichedNotification[]>({
    queryKey: ['userNotifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: rawNotifications, error: fetchError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (fetchError) throw fetchError;

      const paymentRequestIds: string[] = [];
      rawNotifications.forEach(n => {
        if (n.link?.startsWith('/request/')) {
          const id = n.link.split('/')[2];
          if (id) paymentRequestIds.push(id);
        }
      });

      let paymentRequestStatuses: Record<string, PaymentRequest['status']> = {};
      if (paymentRequestIds.length > 0) {
        const { data: requestsData, error: requestsError } = await supabase
          .from('payment_requests')
          .select('id, status')
          .in('id', paymentRequestIds);

        if (requestsError) console.error("Error fetching payment request statuses:", requestsError);
        else {
          requestsData?.forEach(req => {
            paymentRequestStatuses[req.id] = req.status;
          });
        }
      }

      const enrichedNotifications = rawNotifications.map(n => {
        let paymentRequestStatus: PaymentRequest['status'] | undefined;
        if (n.link?.startsWith('/request/')) {
          const id = n.link.split('/')[2];
          if (id) paymentRequestStatus = paymentRequestStatuses[id];
        }
        return { ...n, paymentRequestStatus };
      });

      return enrichedNotifications;
    },
    enabled: !!user?.id,
  });

  // ADDED: Console log to inspect notifications data
  useEffect(() => {
    console.log("[NotificationsPage] Notifications data loaded:", notifications);
  }, [notifications]);

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, created_at: new Date().toISOString() }) // Update created_at to trigger Realtime
        .eq('id', notificationId);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] });
    },
    onError: (error: any) => {
      showError(error.message || "Failed to mark notification as read.");
      console.error("Mark as read error:", error);
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated.");
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, created_at: new Date().toISOString() }) // Update created_at to trigger Realtime
        .eq('user_id', user.id)
        .eq('is_read', false); // Only mark unread ones
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] });
      showSuccess("All notifications marked as read!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to mark all notifications as read.");
      console.error("Mark all as read error:", error);
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] });
      showSuccess("Notification deleted!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete notification.");
      console.error("Delete notification error:", error);
    },
  });

  const clearAllNotificationsMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated.");
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] });
      showSuccess("Notification log cleared!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to clear notification log.");
      console.error("Clear all notifications error:", error);
    },
  });

  // Helper function to format notification messages
  const formatNotificationMessage = (message: string): React.ReactNode => {
    // Pattern to match "status changed from "OLD_STATUS" to "NEW_STATUS""
    const statusChangePattern = /status changed from "([^"]+)" to "([^"]+)"/g;
    // Pattern to match "was marked as URGENT/not urgent"
    const urgentStatusPattern = /was marked as (URGENT|not urgent)/g;

    let formattedText: (string | React.ReactNode)[] = [];
    let currentIndex = 0;
    let match;

    // Process status changes
    while ((match = statusChangePattern.exec(message)) !== null) {
      if (match.index > currentIndex) {
        formattedText.push(message.substring(currentIndex, match.index));
      }
      const oldStatus = cleanAndCapitalizeStatus(match[1]);
      const newStatus = cleanAndCapitalizeStatus(match[2]);
      formattedText.push(
        <React.Fragment key={`status-change-${match.index}`}>
          status changed from <strong>{oldStatus}</strong> to <strong>{newStatus}</strong>
        </React.Fragment>
      );
      currentIndex = match.index + match[0].length;
    }

    // Process urgent status changes
    urgentStatusPattern.lastIndex = 0; // Reset regex for new pass
    while ((match = urgentStatusPattern.exec(message)) !== null) {
      if (match.index > currentIndex) {
        formattedText.push(message.substring(currentIndex, match.index));
      }
      const urgentStatus = match[1];
      formattedText.push(
        <React.Fragment key={`urgent-status-${match.index}`}>
          was marked as <strong>{urgentStatus.toUpperCase()}</strong>
        </React.Fragment>
      );
      currentIndex = match.index + match[0].length;
    }

    // Add any remaining text
    if (currentIndex < message.length) {
      formattedText.push(message.substring(currentIndex));
    }

    return <>{formattedText}</>;
  };

  if (isSessionLoading || isNotificationsLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading notifications...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (notificationsError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading notifications: {notificationsError.message}</div>;
  }

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="Notifications - KH Payments" />
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex justify-between items-center mb-4">
            <CardTitle className="flex items-center text-2xl font-bold">
              <Bell className="mr-2 h-6 w-6" /> Your Notifications ({unreadCount} unread)
            </CardTitle>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending || unreadCount === 0}
                className="shadow-sm"
              >
                <MailOpen className="mr-2 h-4 w-4" /> Mark All as Read
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    onClick={() => {}} // Prevent immediate action
                    disabled={clearAllNotificationsMutation.isPending || (notifications?.length || 0) === 0}
                    className="shadow-sm"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Clear All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete all your notifications.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => clearAllNotificationsMutation.mutate()} asChild>
                      <Button variant="destructive">
                        Clear All Notifications
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <CardDescription>
            Here you can find a log of all important updates related to payment requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notifications && notifications.length > 0 ? (
            <div className="space-y-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "flex items-start space-x-4 p-4 rounded-md border",
                    notification.is_read ? 'bg-muted/50 text-muted-foreground' : 'bg-card text-foreground border-primary/20 shadow-sm',
                    (notification.paymentRequestStatus === 'queried' || notification.paymentRequestStatus === 'declined')
                      ? 'bg-red-100 border-red-400' // Highlight in red for queried/declined payment requests
                      : notification.type === 'feedback_notification' // NEW: Highlight feedback notifications in yellow
                        ? 'bg-yellow-100 border-yellow-400'
                        : ''
                  )}
                >
                  <div className="flex-shrink-0 mt-1">
                    {notification.is_read ? (
                      <MailOpen className="h-5 w-5 text-gray-500" />
                    ) : (
                      <Bell className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className={cn("font-semibold", notification.is_read ? 'text-muted-foreground' : 'text-primary')}>
                        {notification.title}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(notification.created_at), 'MMM dd, yyyy HH:mm')}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{formatNotificationMessage(notification.message)}</p>
                    {notification.link && (
                      <Button asChild variant="link" className="p-0 h-auto mt-2 text-sm">
                        <Link to={notification.link} onClick={() => markAsReadMutation.mutate(notification.id)}>
                          View Details
                        </Link>
                      </Button>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex space-x-2">
                    {!notification.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsReadMutation.mutate(notification.id)}
                        disabled={markAsReadMutation.isPending}
                        className="text-green-600 hover:bg-green-50"
                        title="Mark as Read"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 border-red-500 hover:bg-red-50 shadow-sm"
                          disabled={deleteNotificationMutation.isPending}
                          title="Delete Notification"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Notification?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this notification? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteNotificationMutation.mutate(notification.id)} asChild>
                            <Button variant="destructive">
                              Delete
                            </Button>
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground mt-8">No notifications found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationsPage;