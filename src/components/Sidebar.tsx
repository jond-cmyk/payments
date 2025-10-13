"use client";

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNotifications } from '@/integrations/supabase/NotificationContext'; // Import useNotifications
import { useCountry } from '@/integrations/supabase/CountryContext'; // Import useCountry
import { supabase } from '@/integrations/supabase/client';
import { Home, PlusCircle, List, LogOut, User, Users, Upload, FileX, Mail, Archive, Bell, BellOff, Globe } from 'lucide-react'; // Import Globe icon
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'; // Import Tooltip components
import { useQuery } from '@tanstack/react-query'; // Import useQuery for unread count
import { Badge } from '@/components/ui/badge'; // Import Badge for notification count
// Removed import for CountrySelector as it's moving to Header

interface SidebarProps {
  className?: string;
  isMobile?: boolean;
}

const Sidebar = ({ className, isMobile = false }: SidebarProps) => {
  const { session, user, isLoading, isApproved, userProfile } = useSession();
  const { notificationPermission, notificationsEnabled, requestNotificationPermission, toggleNotifications } = useNotifications(); // Use notification context
  // Removed useCountry as the selector is moving
  const navigate = useNavigate();

  const currentRole = userProfile?.role;
  const displayName = userProfile?.first_name && userProfile?.last_name
    ? `${userProfile.first_name} ${userProfile.last_name}`
    : user?.email || 'Guest';

  // Fetch unread notifications count
  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['unreadNotificationsCount', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (error) {
        console.error("Error fetching unread notifications count:", error);
        return 0;
      }
      return count || 0;
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
    // Removed explicit navigate('/login') and setTimeout.
    // The SessionContext's onAuthStateChange listener will detect SIGNED_OUT
    // and the Index/Login pages' useEffects will handle redirection.
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
          {/* Display logo here */}
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
        {/* Display logo here */}
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
        
        {/* NEW SEPARATOR ADDED HERE */}
        <div className="h-px bg-dyad-blue-foreground my-4" /> 

        <NavLink to="/notifications" icon={<Bell className="h-5 w-5" />} label="Notifications">
          {unreadCount > 0 && (
            <Badge className="ml-auto bg-red-500 text-white">
              {unreadCount}
            </Badge>
          )}
        </NavLink>
        {currentRole === 'admin' && (
          <>
            <div className="h-px bg-dyad-blue-foreground my-4" />
            <NavLink to="/admin/users" icon={<Users className="h-5 w-5" />} label="User Management" />
            <NavLink to="/admin/upload-transactions" icon={<Upload className="h-5 w-5" />} label="Upload Transactions" />
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
            {/* Removed static country display as it's now in the header */}
            {/* Removed Country Selector for Admins as it's now in the header */}
            {/* Notification toggle for all authenticated users */}
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
                  disabled={notificationPermission === 'denied'} // Disable if permission is permanently denied
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
  children?: React.ReactNode; // Allow children for badge
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
      <Link to={to} className="flex items-center w-full"> {/* Ensure Link takes full width */}
        {icon}
        <span className="ml-2">{label}</span>
        {children}
      </Link>
    </Button>
  );
};

export default Sidebar;