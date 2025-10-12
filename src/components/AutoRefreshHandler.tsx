"use client";

import React from 'react';
import { useLocation } from 'react-router-dom';
import useAutoRefresh from '@/hooks/use-auto-refresh';

interface AutoRefreshHandlerProps {
  children: React.ReactNode;
}

const AutoRefreshHandler: React.FC<AutoRefreshHandlerProps> = ({ children }) => {
  const location = useLocation();
  
  // Define routes where auto-refresh should be disabled
  const disableAutoRefreshRoutes = [
    '/new-request',
    '/request/', // Matches /request/:id
    '/transaction/', // Matches /transaction/:id
  ];

  // Check if the current path starts with any of the disabled routes
  const isAutoRefreshDisabled = disableAutoRefreshRoutes.some(route => 
    location.pathname.startsWith(route)
  );

  useAutoRefresh({ intervalMinutes: 2, enabled: !isAutoRefreshDisabled });

  return <>{children}</>;
};

export default AutoRefreshHandler;