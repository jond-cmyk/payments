"use client";

import React from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar'; // To render sidebar in sheet for mobile
import PageTitle from './PageTitle'; // Import the new PageTitle component

const Header = () => {
  const location = useLocation();

  // Function to get a user-friendly title based on the current path
  const getPageTitle = (pathname: string) => {
    switch (pathname) {
      case '/dashboard':
        return 'Dashboard - KH Payments';
      case '/new-request':
        return 'New Payment Request - KH Payments';
      case '/admin/requests':
        return 'All Payment Requests - KH Payments';
      case '/admin/users':
        return 'User Management - KH Payments';
      case '/admin/upload-transactions':
        return 'Upload Transactions - KH Payments';
      case '/my-transactions':
        return 'Card Payment Receipts - KH Payments'; // Updated title
      case '/login':
        return 'Login - KH Payments';
      case '/':
        return 'Welcome - KH Payments';
      default:
        if (pathname.startsWith('/request/')) {
          return 'Payment Request Details - KH Payments';
        }
        if (pathname.startsWith('/transaction/')) {
          return 'Card Payment Receipt Details - KH Payments'; // Updated title
        }
        return 'KH Payments'; // Default title for unknown routes
    }
  };

  const title = getPageTitle(location.pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      <PageTitle title={title} /> {/* Set the browser tab title */}

      {/* Mobile Sidebar Toggle */}
      <Sheet>
        <SheetTrigger asChild>
          <Button size="icon" variant="outline" className="sm:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle Menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="sm:max-w-xs p-0"> {/* p-0 to let Sidebar manage its own padding */}
          <Sidebar isMobile={true} /> {/* Pass isMobile prop */}
        </SheetContent>
      </Sheet>

      <h2 className="text-xl font-semibold">{title.replace(' - KH Payments', '')}</h2> {/* Display title without app name in header */}
      {/* Add any other header elements here, e.g., user menu, notifications */}
      <div className="ml-auto">
        {/* Future: User menu, notifications, etc. */}
      </div>
    </header>
  );
};

export default Header;