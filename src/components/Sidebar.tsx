"use client";

import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNotifications } from '@/integrations/supabase/NotificationContext';
import { supabase } from '@/integrations/supabase/client';
import { Home, PlusCircle, List, LogOut, User, Users, Upload, FileX, Mail, Archive, Bell, BellOff, Globe, KeyRound, Settings, Banknote, Repeat, DollarSign, MessageSquareText, BarChart } from 'lucide-react'; // Import BarChart icon
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ChangePasswordForm from '@/components/auth/ChangePasswordForm';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from "@/components/ui/accordion";
import { CustomAccordionTrigger } from '@/components/CustomAccordionTrigger';

interface SidebarProps {
  className?: string;
  isMobile?: boolean;
}

const Sidebar = ({ className, isMobile = false }: SidebarProps) => {
  const { session, user, isLoading, isApproved, userProfile } = useSession();
  const { notificationPermission, notificationsEnabled, requestNotificationPermission, toggleNotifications } = useNotifications();
  const navigate = useNavigate();
  const [isChangePasswordDialogOpen, setIsChangePasswordDialogOpen] = useState(false);

  const currentRole = userProfile?.role;
  const displayName = userProfile?.first_name && userProfile?.last_name
    ? `${userProfile.first_name} ${userProfile.last_name}`
    : user?.email || 'Guest';

  // Fetch unread notifications count
  const { data: unreadNotificationsCount = 0 } = useQuery<number>({
    queryKey: ['unreadNotificationsCount', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;

      let totalUnread = 0;

      // Count unread user-specific notifications
      const { count: notificationsCount, error: notificationsError } = await supabase
        .from('notifications')
        .select('id', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('is_read', false);
      
      if (notificationsError) {
        console.error("Error fetching unread user notifications count:", notificationsError);
      } else {
        totalUnread += notificationsCount || 0;
      }
      
      return totalUnread;
    },
    enabled: !!user?.id,
  });

  const handleLogout = async () => {
    console.log("Sidebar: Attempting to log out...");
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sidebar: Error during logout:", error);
    } else {
      console.log("Sidebar: Logout successful. SessionContext will handle navigation.");
    }
  };

  if (isLoading) {
    return null;
  }

  // If not logged in or not approved, only show login/logout button
  if (!session || !isApproved) {
    return (
      <div className={cn(
        "flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-md",
        isMobile ? "p-4" : "p-4",
        className
      )}>
        <div className="flex items-center justify-center h-16 border-b border-sidebar-border mb-6">
          <img src="https://kassoehousing.com/wp-content/uploads/2024/10/logo-hoj-sort-rgb.png" alt="KH Payments Logo" className="h-12" />
        </div>
        <div className="mt-auto pt-4 border-t border-sidebar-border">
          {session ? (
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start text-red-500 hover:bg-red-100 hover:text-red-600"
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

  // Render full sidebar for approved users
  return (
    <div className={cn(
      "flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-md",
      isMobile ? "p-4" : "p-4",
      className
    )}>
      <div className="flex items-center justify-center h-16 border-b border-sidebar-border mb-6">
        <img src="https://kassoehousing.com/wp-content/uploads/2024/10/logo-hoj-sort-rgb.png" alt="KH Payments Logo" className="h-12" />
      </div>
      <nav className="flex-1 space-y-2">
        <NavLink to="/dashboard" icon={<Home className="h-5 w-5" />} label="Dashboard" />
        {(currentRole === 'requester' || currentRole === 'admin') && (
          <NavLink to="/new-request" icon={<PlusCircle className="h-5 w-5" />} label="New Request" />
        )}
        <NavLink to="/admin/requests" icon={<List className="h-5 w-5" />} label="All Requests" />
        <div className="h-px bg-dyad-blue-foreground my-4" />
        <NavLink to="/missing-receipts" icon={<FileX className="h-5 w-5" />} label="Missing Receipts" />
        <NavLink to="/completed-receipts" icon={<Archive className="h-5 w-5" />} label="Completed Receipts" />
        
        <div className="h-px bg-dyad-blue-foreground my-4" /> 
        <NavLink to="/direct-debits" icon={<Banknote className="h-5 w-5" />} label="Direct Debits" />
        <NavLink to="/standing-orders" icon={<Repeat className="h-5 w-5" />} label="Standing Orders" />
        <div className="h-px bg-dyad-blue-foreground my-4" />
        <NavLink to="/admin/customers" icon={<Users className="h-5 w-5" />} label="Customers" /> {/* MOVED: Customers Link */}
        <NavLink to="/customer-deposit-returns" icon={<DollarSign className="h-5 w-5" />} label="Customer Deposit Returns" />
        
        <div className="h-px bg-dyad-blue-foreground my-4" /> 

        <NavLink to="/notifications" icon={<Bell className="h-5 w-5" />} label="Notifications">
          {unreadNotificationsCount > 0 && (
            <Badge className="ml-auto bg-red-500 text-white transform translate-x-0 translate-y-0">
              {unreadNotificationsCount}
            </Badge>
          )}
        </NavLink>
        <NavLink to="/profile" icon={<User className="h-5 w-5" />} label="My Profile" />
        <NavLink to="/admin/statistics" icon={<BarChart className="h-5 w-5" />} label="Statistics" />
        
        {currentRole === 'admin' && (
          <>
            <div className="h-px bg-dyad-blue-foreground my-4" />
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="admin-panel" className="border-b-0">
                <CustomAccordionTrigger className="flex items-center justify-between w-full px-4 py-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors rounded-md">
                  <span className="flex items-center">
                    <Settings className="mr-2 h-5 w-5" /> Admin Panel
                  </span>
                </CustomAccordionTrigger>
                <AccordionContent className="pl-6 pt-2 pb-0 space-y-2">
                  <NavLink to="/admin/users" icon={<Users className="h-5 w-5" />} label="User Management" />
                  <NavLink to="/admin/upload-transactions" icon={<Upload className="h-5 w-5" />} label="Upload Transactions" />
                  <NavLink to="/admin/upload-direct-debits" icon={<Banknote className="h-5 w-5" />} label="Upload Direct Debits" />
                  <NavLink to="/admin/upload-standing-orders" icon={<Repeat className="h-5 w-5" />} label="Upload Standing Orders" />
                  <NavLink to="/admin/feedback" icon={<MessageSquareText className="h-5 w-5" />} label="User Feedback" />
                  <NavLink to="/admin/economic-integration" icon={<Globe className="h-5 w-5" />} label="E-conomic Integration" />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}
      </nav>
      <div className="mt-auto pt-4 border-t border-sidebar-border">
        {session && user ? (
          <div className="flex flex-col items-start space-y-2">
            <div className="flex items-center space-x-2 text-sm">
              <User className="h-4 w-4" />
              <span>{displayName}</span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  onClick={toggleNotifications}
                  className={cn(
                    "w-full justify-start",
                    notificationsEnabled && notificationPermission === 'granted'
                      ? "text-green-400 hover:bg-green-900 hover:text-green-300"
                      : "text-red-400 hover:bg-red-900 hover:text-red-300"
                  )}
                  disabled={notificationPermission === 'denied'}
                >
                  {notificationsEnabled && notificationPermission === 'granted' ? (
                    <Bell className="mr-2 h-4 w-4" />
                  ) : (
                    <BellOff className="mr-2 h-4 w-4" />
                  )}
                  {notificationsEnabled && notificationPermission === 'granted' ? "Notifications On" : "Notifications Off"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {notificationPermission === 'denied' ? (
                  <span>Notifications are blocked. Enable in browser settings.</span>
                ) : notificationsEnabled ? (
                  <span>Click to disable desktop notifications.</span>
                ) : (
                  <span>Click to enable desktop notifications.</span>
                )}
              </TooltipContent>
            </Tooltip>

            <Dialog open={isChangePasswordDialogOpen} onOpenChange={setIsChangePasswordDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" className="w-full justify-start">
                  <KeyRound className="mr-2 h-4 w-4" /> Change Password
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Change Password</DialogTitle>
                </DialogHeader>
                <ChangePasswordForm onPasswordChanged={() => setIsChangePasswordDialogOpen(false)} />
              </DialogContent>
            </Dialog>

            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start text-red-500 hover:bg-red-100 hover:text-red-600"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log Out
            </Button>
          </div>
        ) : (
          <Button onClick={() => navigate('/login')} className="w-full">
            Log In
          </Button>
        )}
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