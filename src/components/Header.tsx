"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, Search, XCircle } from 'lucide-react';
import Sidebar from './Sidebar';
import PageTitle from './PageTitle';
import { ThemeToggle } from './ThemeToggle';
import { Input } from '@/components/ui/input';
import { useSession } from '@/integrations/supabase/SessionContext';

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { userProfile } = useSession();

  // Sync search input with URL query param
  useEffect(() => {
    setSearchTerm(searchParams.get('q') || '');
  }, [searchParams]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      const trimmedTerm = term.trim();
      if (trimmedTerm) {
        // Always navigate to dashboard to show results
        navigate(`/dashboard?q=${encodeURIComponent(trimmedTerm)}`);
      } else {
        // If search is cleared and we are on dashboard, remove query param.
        if (location.pathname === '/dashboard') {
          navigate('/dashboard');
        }
      }
    }, 700);
  };

  const clearSearch = () => {
    setSearchTerm('');
    if (location.pathname === '/dashboard') {
      navigate('/dashboard');
    }
  };

  // Function to get a user-friendly title based on the current path
  const getPageTitle = (pathname: string) => {
    switch (pathname) {
      case '/dashboard':
        return 'Dashboard - KH Payments';
      case '/new-request':
        return 'New Payment Request - KH Payments';
      case '/admin/requests':
        return 'All Payment Requests - KH Payments';
      case '/admin/panel':
        return 'Admin Panel - KH Payments';
      case '/admin/users':
        return 'User Management - KH Payments';
      case '/admin/upload-transactions':
        return 'Upload Transactions - KH Payments';
      case '/admin/upload-direct-debits':
        return 'Upload Direct Debits - KH Payments';
      case '/admin/upload-standing-orders':
        return 'Upload Standing Orders - KH Payments';
      case '/customer-deposit-returns':
        return 'Customer Deposit Returns - KH Payments';
      case '/landlord-deposits':
        return 'Landlord Deposits - KH Payments'; // NEW TITLE
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
      case '/standing-order/:id':
        return 'Standing Order Details - KH Payments';
      case '/login':
        return 'Login - KH Payments';
      case '/':
        return 'Welcome - KH Payments';
      case '/notifications':
        return 'Notifications - KH Payments';
      case '/admin/feedback':
        return 'Admin Feedback - KH Payments';
      case '/profile':
        return 'My Profile - KH Payments';
      case '/admin/statistics':
        return 'Statistics - KH Payments';
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
        if (pathname.startsWith('/standing-order/')) {
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

      <h2 className="text-xl font-semibold hidden md:block">{title.replace(' - KH Payments', '')}</h2>
      
      <div className="ml-auto flex items-center gap-4">
        {/* Search Input - Hidden for Sales */}
        {userProfile?.role !== 'sales' && (
          <div className="relative flex-1 md:grow-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-dyad-blue-foreground/70" />
            <Input
              type="search"
              placeholder="Search all records..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full rounded-lg bg-dyad-blue text-dyad-blue-foreground placeholder:text-dyad-blue-foreground/70 pl-8 md:w-[200px] lg:w-[336px] border-dyad-blue-light"
            />
            {searchTerm && (
              <XCircle
                className="absolute right-2.5 top-2.5 h-4 w-4 text-dyad-blue-foreground/70 cursor-pointer hover:text-dyad-blue-foreground"
                onClick={clearSearch}
              />
            )}
          </div>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
};

export default Header;