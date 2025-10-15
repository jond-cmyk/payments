"use client";

import React from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import PageTitle from './PageTitle';
// Removed import for CountrySelector as it's moving

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
      case '/admin/upload-direct-debits': // NEW: Page title for Direct Debit upload
        return 'Upload Direct Debits - KH Payments';
      case '/admin/upload-standing-orders': // NEW: Page title for Standing Order upload
        return 'Upload Standing Orders - KH Payments';
      case '/customer-deposit-returns': // NEW: Page title for Customer Deposit Returns
        return 'Customer Deposit Returns - KH Payments';
      case '/missing-receipts':
        return 'Missing Receipts - KH Payments';
      case '/completed-receipts':
        return 'Completed Receipts - KH Payments';
      case '/direct-debits':
        return 'Direct Debits - KH Payments';
      case '/direct-debit/:id':
        return 'Direct Debit Details - KH Payments';
      case '/standing-orders':
        return 'Standing Orders - KH Payments';
      case '/standing-order/:id': // NEW: Standing Order Detail Page Title
        return 'Standing Order Details - KH Payments';
      case '/login':
        return 'Login - KH Payments';
      case '/':
        return 'Welcome - KH Payments';
      case '/notifications':
        return 'Notifications - KH Payments';
      case '/admin/feedback': // NEW: Admin Feedback Page Title
        return 'Admin Feedback - KH Payments';
      default:
        if (pathname.startsWith('/request/')) {
          return 'Payment Request Details - KH Payments';
        }
        if (pathname.startsWith('/transaction/')) {
          return 'Transaction Details - KH Payments';
        }
        if (pathname.startsWith('/direct-debit/')) {
          return 'Direct Debit Details - KH Payments';
        }
        if (pathname.startsWith('/standing-order/')) { // NEW: Standing Order Detail Page Title
          return 'Standing Order Details - KH Payments';
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
      <div className="ml-auto flex items-center gap-4"> {/* Added flex and gap for spacing */}
        {/* CountrySelector removed from here */}
      </div>
    </header>
  );
};

export default Header;