"use client";

import React from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import PageTitle from './PageTitle';

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
      case '/missing-receipts':
        return 'Missing Receipts - KH Payments'; // Updated title
      case '/login':
        return 'Login - KH Payments';
      case '/':
        return 'Welcome - KH Payments';
      case '/admin/test-email':
        return 'Test Email - KH Payments';
      default:
        if (pathname.startsWith('/request/')) {
          return 'Payment Request Details - KH Payments';
        }
        if (pathname.startsWith('/transaction/')) {
          return 'Transaction Details - KH Payments';
        }
        return 'KH Payments'; // Default title for unknown routes
    }
  };

  const title = getPageTitle(location.pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      <PageTitle title={title} />

      {/* Mobile Sidebar Toggle */}
      <Sheet>
        <SheetTrigger asChild>
          <Button size="icon" variant="outline" className="sm:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle Menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="sm:max-w-xs p-0">
          <Sidebar isMobile={true} />
        </SheetContent>
      </Sheet>

      <h2 className="text-xl font-semibold">{title.replace(' - KH Payments', '')}</h2>
      <div className="ml-auto">
      </div>
    </header>
  );
};

export default Header;