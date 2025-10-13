"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './client';
import { useSession } from './SessionContext';
import { Notification as NotificationType } from '@/types/supabase'; // Import Notification type
import { showSuccess, showError } from '@/utils/toast';
import { useQueryClient } from '@tanstack/react-query'; // Import useQueryClient

interface NotificationContextType {
  notificationPermission: NotificationPermission;
  notificationsEnabled: boolean;
  requestNotificationPermission: () => void;
  toggleNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading: isSessionLoading } = useSession();
  const queryClient = useQueryClient(); // Initialize useQueryClient
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    // Initialize from localStorage, default to false
    if (typeof window !== 'undefined') {
      return localStorage.getItem('notificationsEnabled') === 'true';
    }
    return false;
  });

  // Function to request notification permission
  const requestNotificationPermission = useCallback(() => {
    if (!('Notification' in window)) {
      showError("This browser does not support desktop notifications.");
      return;
    }
    console.log("[NotificationProvider] Before Notification.requestPermission(), browser permission is:", Notification.permission);
    Notification.requestPermission().then((permission) => {
      console.log("[NotificationProvider] Permission requested. Result:", permission);
      setNotificationPermission(permission);
      if (permission === 'granted') {
        showSuccess("Desktop notifications enabled!");
        setNotificationsEnabled(true); // Automatically enable if granted
        localStorage.setItem('notificationsEnabled', 'true');
      } else {
        showError("Desktop notification permission denied. You can enable it in your browser settings.");
        setNotificationsEnabled(false); // Disable if denied
        localStorage.setItem('notificationsEnabled', 'false');
      }
    });
  }, []);

  // Function to toggle user's preference for notifications
  const toggleNotifications = useCallback(() => {
    setNotificationsEnabled(prev => {
      const newState = !prev;
      localStorage.setItem('notificationsEnabled', String(newState));
      console.log(`[NotificationProvider] Toggled notifications. New state: ${newState}. localStorage: ${localStorage.getItem('notificationsEnabled')}`); // NEW LOG
      if (newState && notificationPermission !== 'granted') {
        // If enabling and permission is not granted, request it
        requestNotificationPermission();
      } else if (!newState) {
        showSuccess("Desktop notifications disabled.");
      }
      return newState;
    });
  }, [notificationPermission, requestNotificationPermission]);

  // Effect to read initial browser permission status once on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentBrowserPermission = Notification.permission;
    setNotificationPermission(currentBrowserPermission);
    console.log("[NotificationProvider] Initial browser permission on mount:", currentBrowserPermission);
  }, []); // Empty dependency array: runs once on mount

  // Effect to proactively request permission if enabled in localStorage but permission is 'default'
  useEffect(() => {
    if (notificationsEnabled && notificationPermission === 'default') {
      console.log("[NotificationProvider] Notifications enabled in localStorage and permission is 'default'. Proactively requesting permission.");
      requestNotificationPermission();
    }
  }, [notificationsEnabled, notificationPermission, requestNotificationPermission]);

  useEffect(() => {
    if (isSessionLoading || !user) return; // Only proceed if session is loaded and user exists

    console.log(`[NotificationProvider] Realtime useEffect: notificationPermission=${notificationPermission}, notificationsEnabled=${notificationsEnabled}`);

    if (notificationPermission !== 'granted' || !notificationsEnabled) {
      console.log("[NotificationProvider] Not subscribing to Realtime for notifications table: Permission not granted, or notifications disabled.");
      return;
    }

    console.log("[NotificationProvider] Subscribing to user-specific notifications via Realtime for user:", user.id);

    const notificationsChannel = supabase
      .channel(`user_notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`, // Filter for current user's notifications
        },
        (payload) => {
          const newNotification = payload.new as NotificationType;
          console.log("[NotificationProvider] New user notification received via Realtime:", newNotification);

          // Only show desktop notification if it's not marked as read and notifications are enabled
          if (!newNotification.is_read && notificationsEnabled && Notification.permission === 'granted') {
            console.log("[NotificationProvider] Attempting to display desktop notification. Current browser permission:", Notification.permission);
            const notificationTitle = newNotification.title;
            const notificationOptions: NotificationOptions = {
              body: newNotification.message,
              icon: '/favicon.svg',
              data: {
                url: `${window.location.origin}${newNotification.link}`,
                notificationId: newNotification.id,
              },
            };

            const browserNotification = new Notification(notificationTitle, notificationOptions);

            browserNotification.onclick = (event) => {
              event.preventDefault();
              if (browserNotification.data && browserNotification.data.url) {
                window.focus();
                window.open(browserNotification.data.url, '_blank');
              }
              // Mark notification as read in the database when clicked
              supabase.from('notifications').update({ is_read: true }).eq('id', newNotification.id).then(({ error }) => {
                if (error) console.error("Failed to mark notification as read:", error);
                else queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] }); // Invalidate count
              });
              browserNotification.close();
            };
          }
          // Invalidate the unread count query to update the sidebar badge
          queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] });
        }
      )
      .subscribe();

    return () => {
      console.log("[NotificationProvider] Unsubscribing from user_notifications channel.");
      notificationsChannel.unsubscribe();
    };
  }, [user, isSessionLoading, notificationPermission, notificationsEnabled, queryClient]);

  return (
    <NotificationContext.Provider value={{ notificationPermission, notificationsEnabled, requestNotificationPermission, toggleNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};