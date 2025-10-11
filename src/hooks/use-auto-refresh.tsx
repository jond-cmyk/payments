"use client";

import { useEffect, useRef } from 'react'; // Import useRef

interface UseAutoRefreshOptions {
  intervalMinutes?: number; // Interval in minutes
  enabled?: boolean; // Whether auto-refresh is enabled
}

const useAutoRefresh = ({ intervalMinutes = 2, enabled = true }: UseAutoRefreshOptions = {}) => {
  // Use refs to hold the latest values of props, so they don't trigger effect re-runs
  const intervalMinutesRef = useRef(intervalMinutes);
  const enabledRef = useRef(enabled);

  // Update refs whenever props change
  useEffect(() => {
    intervalMinutesRef.current = intervalMinutes;
    enabledRef.current = enabled;
  }, [intervalMinutes, enabled]);

  useEffect(() => {
    // Access current values from refs
    if (!enabledRef.current) {
      console.log('[AutoRefresh] Auto-refresh is disabled.');
      return;
    }

    const currentIntervalMinutes = intervalMinutesRef.current;
    const intervalMs = currentIntervalMinutes * 60 * 1000; // Convert minutes to milliseconds

    console.log(`[AutoRefresh] Setting up auto-refresh timer for ${currentIntervalMinutes} minutes.`);

    const timer = setInterval(() => {
      console.warn(`[AutoRefresh] Triggering page reload after ${currentIntervalMinutes} minutes.`);
      window.location.reload();
    }, intervalMs);

    // Clear the interval when the component unmounts
    return () => {
      clearInterval(timer);
      console.log('[AutoRefresh] Auto-refresh timer cleared.');
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount
};

export default useAutoRefresh;