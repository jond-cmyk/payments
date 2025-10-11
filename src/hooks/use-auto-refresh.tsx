"use client";

import { useEffect, useRef } from 'react';

interface UseAutoRefreshOptions {
  intervalMinutes?: number; // Interval in minutes
  enabled?: boolean; // Whether auto-refresh is enabled
}

const useAutoRefresh = ({ intervalMinutes = 2, enabled = true }: UseAutoRefreshOptions = {}) => {
  const timerIdRef = useRef<number | null>(null); // Ref to store the interval ID
  const intervalMinutesRef = useRef(intervalMinutes);
  const enabledRef = useRef(enabled);

  // Update refs whenever props change
  useEffect(() => {
    intervalMinutesRef.current = intervalMinutes;
    enabledRef.current = enabled;
  }, [intervalMinutes, enabled]);

  useEffect(() => {
    // Only set up the interval if it hasn't been set yet and is enabled
    if (timerIdRef.current === null && enabledRef.current) {
      const currentIntervalMinutes = intervalMinutesRef.current;
      const intervalMs = currentIntervalMinutes * 60 * 1000;

      console.log(`[AutoRefresh] Setting up auto-refresh timer for ${currentIntervalMinutes} minutes.`);

      timerIdRef.current = window.setInterval(() => {
        console.warn(`[AutoRefresh] Triggering page reload after ${currentIntervalMinutes} minutes.`);
        window.location.reload();
      }, intervalMs);
    } else if (!enabledRef.current && timerIdRef.current !== null) {
      // If disabled and timer is running, clear it
      window.clearInterval(timerIdRef.current);
      timerIdRef.current = null;
      console.log('[AutoRefresh] Auto-refresh timer cleared due to disablement.');
    }

    // Cleanup function: clear the interval when the component unmounts
    return () => {
      if (timerIdRef.current !== null) {
        window.clearInterval(timerIdRef.current);
        timerIdRef.current = null;
        console.log('[AutoRefresh] Auto-refresh timer cleared on unmount.');
      }
    };
  }, [enabled]); // Depend only on 'enabled' to control the timer's active state
};

export default useAutoRefresh;