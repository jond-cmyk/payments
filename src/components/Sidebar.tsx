"use client";

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { Home, PlusCircle, List, LogOut, User, Users, FileX, Archive, Bell, Settings, Banknote, Repeat, DollarSign, BarChart, Home as HomeIcon, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidebarProps {
  className?: string;
  isMobile?: boolean;
}

const Sidebar = ({ isMobile = false }: SidebarProps) => {
  const { session, user, isLoading, isApproved, userProfile } = useSession();
  const navigate = useNavigate();

  const isAdmin = userProfile?.role === 'admin';
  const isSales = userProfile?.role === 'sales';
  const isRequester = userProfile?.role === 'requester';

  const displayName = userProfile?.first_name && userProfile?.last_name
    ? `${userProfile.first_name} ${userProfile.last_name}`
    : user?.email || 'Guest';

  // Fetch unread notifications count
  const { data: unreadNotificationsCount = 0 } = useQuery<number>({
    queryKey: ['unreadNotificationsCount', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count: notificationsCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('is_read', false);
      return notificationsCount || 0;
    },
    enabled: !!user?.id,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (isLoading) {
    return null;
  }

  if (!session || !isApproved) {
    return (
      <div className={cn(
        "flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-md",
        isMobile ? "p-4" : "p-4",
      )}>
        <div className="flex items-center justify-center h-16 border-b border-sidebar-border mb-6">
          <img src="https://kassoehousing.com/wp-content/uploads/2024/10/logo-hoj-sort-rgb.png" alt="KH Payments Logo" className="h-12" />
        </div>
        <div className="mt-auto pt-4 border-t border-sidebar-border">
          {session ? (
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start text-sidebar-foreground hover:bg-red-500/20 hover:text-red-300"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log Out
            </Button>
          ) : (
            <Button onClick={() => navigate('/login')} className="w-full">
              Log In
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-md",
      isMobile ? "p-4" : "p-4",
    )}>
      <div className="flex items-center justify-center h-16 border-b border-sidebar-border mb-6 flex-shrink-0">
        <img src="https://kassoehousing.com/wp-content/uploads/2024/10/logo-hoj-sort-rgb.png" alt="KH Payments Logo" className="h-12" />
      </div>
      
      <ScrollArea className="flex-1">
        <nav className="space-y-1">
          
          {/* Core Features - Available to Everyone */}
          <NavLink to="/dashboard" icon={<Home className="h-5 w-5" />} label="Dashboard" />
          
          {/* Requester & Admin Only Features */}
          {(isRequester || isAdmin) && (
            <>
              <NavLink to="/new-request" icon={<PlusCircle className="h-5 w-5" />} label="New Request" />
              <NavLink to="/admin/requests" icon={<List className="h-5 w-5" />} label="All Requests" />
              <div className="h-px bg-dyad-blue-foreground my-4" />
              <NavLink to="/missing-receipts" icon={<FileX className="h-5 w-5" />} label="Missing Receipts" />
              <NavLink to="/completed-receipts" icon={<Archive className="h-5 w-5" />} label="Completed Receipts" />
              <div className="h-px bg-dyad-blue-foreground my-4" /> 
              <NavLink to="/direct-debits" icon={<Banknote className="h-5 w-5" />} label="Direct Debits" />
              <NavLink to="/standing-orders" icon={<Repeat className="h-5 w-5" />} label="Standing Orders" />
              <div className="h-px bg-dyad-blue-foreground my-4" />
            </>
          )}

          {/* Sales Only Features - Shown when role is Sales */}
          {isSales && (
            <NavLink to="/admin/requests" icon={<List className="h-5 w-5" />} label="All Requests" />
          )}

          {/* Sales / Property Features - Available to Everyone (including Sales) */}
          <NavLink to="/admin/customers" icon={<Users className="h-5 w-5" />} label="Customers" />
          <NavLink to="/customer-deposits" icon={<DollarSign className="h-5 w-5" />} label="Customer Deposits" />
          <NavLink to="/customer-deposit-returns" icon={<DollarSign className="h-5 w-5" />} label="Customer Deposit Returns" />
          <NavLink to="/landlord-deposits" icon={<HomeIcon className="h-5 w-5" />} label="Landlord Deposits" />
          <NavLink to="/deposit-return-advisements" icon={<DollarSign className="h-5 w-5" />} label="Deposit Return Advisements" />
          <NavLink to="/property-pnl" icon={<BarChart className="h-5 w-5" />} label="Property P&L" />
          
          <div className="h-px bg-dyad-blue-foreground my-4" /> 

          <NavLink to="/notifications" icon={<Bell className="h-5 w-5" />} label="Notifications">
            {unreadNotificationsCount > 0 && (
              <Badge className="ml-auto bg-red-500 text-white transform translate-x-0 translate-y-0">
                {unreadNotificationsCount}
              </Badge>
            )}
          </NavLink>
          <NavLink to="/profile" icon={<User className="h-5 w-5" />} label="My Profile" />
          
          {/* Admin Only Features */}
          {isAdmin && (
            <>
              <NavLink to="/admin/statistics" icon={<BarChart className="h-5 w-5" />} label="Statistics" />
              <div className="h-px bg-dyad-blue-foreground my-4" />
              <NavLink to="/admin/panel" icon={<Settings className="h-5 w-5" />} label="Admin Panel" />
            </>
          )}
          
          <NavLink to="/user-guide" icon={<BookOpen className="h-5 w-5" />} label="User Guide" />
        </nav>
      </ScrollArea>
      
      <div className="mt-auto pt-4 border-t border-sidebar-border flex-shrink-0">
        <div className="flex flex-col items-start space-y-2">
          <div className="flex items-center space-x-2 text-sm">
            <User className="h-4 w-4" />
            <span>{displayName}</span>
          </div>
          
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start text-sidebar-foreground hover:bg-red-500/20 hover:text-red-300"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log Out
          </Button>
        </div>
      </div>
    </div>
  );
};

interface NavLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  children?: React.ReactNode;
}

const NavLink = ({ to, icon, label, children }: NavLinkProps) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={cn(
        "w-full justify-start",
        isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Link to={to} className="flex items-center w-full">
        {icon}
        <span className="ml-2">{label}</span>
        {children}
      </Link>
    </Button>
  );
};

export default Sidebar;