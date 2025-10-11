"use client";

import { useEffect } from 'react';

interface UseAutoRefreshOptions {
  intervalMinutes?: number; // Interval in minutes
  enabled?: boolean; // Whether auto-refresh is enabled
}

const useAutoRefresh = ({ intervalMinutes = 2, enabled = true }: UseAutoRefreshOptions = {}) => {
  useEffect(() => {
    if (!enabled) {
      console.log('[AutoRefresh] Auto-refresh is disabled.');
      return;
    }

    // Temporarily set a very short interval for debugging
    const debugIntervalSeconds = 5; // 5 seconds
    const intervalMs = debugIntervalSeconds * 1000; // Convert seconds to milliseconds

    console.log(`[AutoRefresh] Setting up auto-refresh timer for ${debugIntervalSeconds} seconds.`);

    const timer = setInterval(() => {
      console.warn(`[AutoRefresh] Triggering page reload after ${debugIntervalSeconds} seconds.`);
      window.location.reload();
    }, intervalMs);

    // Clear the interval when the component unmounts or dependencies change
    return () => {
      clearInterval(timer);
      console.log('[AutoRefresh] Auto-refresh timer cleared.');
    };
  }, [intervalMinutes, enabled]); // Re-run effect if interval or enabled state changes
};

export default useAutoRefresh;