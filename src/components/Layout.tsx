"use client";

import React from 'react';
import Sidebar from './Sidebar';
import { useLocation } from 'react-router-dom'; // Import useLocation

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation(); // Get current location
  console.log("Layout: Current path:", location.pathname, "Rendering child:", children?.type?.name || "Unknown Component"); // Log current path and child component

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
};

export default Layout;