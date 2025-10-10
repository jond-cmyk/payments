"use client";

import { useEffect } from 'react';

interface UseAutoRefreshOptions {
  intervalMinutes?: number; // Interval in minutes
  enabled?: boolean; // Whether auto-refresh is enabled
}

const useAutoRefresh = ({ intervalMinutes = 2, enabled = true }: UseAutoRefreshOptions = {}) => {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000; // Convert minutes to milliseconds

    const timer = setInterval(() => {
      console.log(`Auto-refreshing page after ${intervalMinutes} minutes.`);
      window.location.reload();
    }, intervalMs);

    // Clear the interval when the component unmounts or dependencies change
    return () => {
      clearInterval(timer);
      console.log('Auto-refresh timer cleared.');
    };
  }, [intervalMinutes, enabled]); // Re-run effect if interval or enabled state changes
};

export default useAutoRefresh;