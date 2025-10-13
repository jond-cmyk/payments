"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './client';
import { useSession } from './SessionContext';
import { PaymentRequest } from '@/types/supabase';
import { showSuccess, showError } from '@/utils/toast';

interface NotificationContextType {
  notificationPermission: NotificationPermission;
  notificationsEnabled: boolean;
  requestNotificationPermission: () => void;
  toggleNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const { userProfile, user, isLoading: isSessionLoading } = useSession();
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

    Notification.requestPermission().then((permission) => {
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
      if (newState && notificationPermission !== 'granted') {
        // If enabling and permission is not granted, request it
        requestNotificationPermission();
      } else if (!newState) {
        showSuccess("Desktop notifications disabled.");
      }
      return newState;
    });
  }, [notificationPermission, requestNotificationPermission]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (isSessionLoading || !userProfile || !user) return;

    const isAdmin = userProfile.role === 'admin';

    if (!isAdmin || notificationPermission !== 'granted' || !notificationsEnabled) {
      console.log("[NotificationProvider] Not subscribing to Realtime: Not admin, permission not granted, or notifications disabled.");
      return;
    }

    console.log("[NotificationProvider] Admin user detected, permission granted, notifications enabled. Subscribing to new payment requests...");

    const paymentRequestsChannel = supabase
      .channel('payment_requests_channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payment_requests' },
        (payload) => {
          const newRequest = payload.new as PaymentRequest;
          console.log("[NotificationProvider] New payment request received via Realtime:", newRequest);

          // Prevent self-notification
          if (newRequest.requester_id === user.id) {
            console.log("[NotificationProvider] New request created by current user, skipping notification.");
            return;
          }

          if (Notification.permission === 'granted') {
            const notificationTitle = `New Payment Request: ${newRequest.supplier_name}`;
            const notificationOptions: NotificationOptions = {
              body: `SKU: ${newRequest.sku_number || 'N/A'}\nAmount: ${newRequest.currency} ${newRequest.payment_amount.toFixed(2)}\nReason: ${newRequest.reason_for_payment}`,
              icon: '/favicon.svg', // Path to your app's icon
              data: {
                url: `${window.location.origin}/request/${newRequest.id}`,
              },
            };

            const notification = new Notification(notificationTitle, notificationOptions);

            notification.onclick = (event) => {
              event.preventDefault();
              if (notification.data && notification.data.url) {
                window.focus(); // Bring browser window to front
                window.open(notification.data.url, '_blank'); // Open in new tab
              }
              notification.close();
            };
          }
        }
      )
      .subscribe();

    return () => {
      console.log("[NotificationProvider] Unsubscribing from payment_requests_channel.");
      paymentRequestsChannel.unsubscribe();
    };
  }, [userProfile, user, isSessionLoading, notificationPermission, notificationsEnabled]); // Re-run effect if these change

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