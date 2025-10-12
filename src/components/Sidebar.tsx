"use client";

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { Home, PlusCircle, List, LogOut, User, Users, Upload, FileX, Mail, Archive } from 'lucide-react'; // Import Archive icon
import { cn } from '@/lib/utils';

interface SidebarProps {
  className?: string;
  isMobile?: boolean;
}

const Sidebar = ({ className, isMobile = false }: SidebarProps) => {
  const { session, user, isLoading, isApproved, userProfile } = useSession();
  const navigate = useNavigate();

  const currentRole = userProfile?.role;
  const displayName = userProfile?.first_name && userProfile?.last_name
    ? `${userProfile.first_name} ${userProfile.last_name}`
    : user?.email || 'Guest';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (isLoading) {
    return null; // Don't render sidebar while session is loading
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
          <h1 className="text-2xl font-bold text-dyad-blue">KH Payments</h1>
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
        <h1 className="text-2xl font-bold text-dyad-blue">KH Payments</h1>
      </div>
      <nav className="flex-1 space-y-2">
        <NavLink to="/dashboard" icon={<Home className="h-5 w-5" />} label="Dashboard" />
        {(currentRole === 'requester' || currentRole === 'admin') && (
          <NavLink to="/new-request" icon={<PlusCircle className="h-5 w-5" />} label="New Request" />
        )}
        {/* 'All Requests' is now visible to all approved users */}
        <NavLink to="/admin/requests" icon={<List className="h-5 w-5" />} label="All Requests" />
        <div className="h-px bg-dyad-blue my-4" /> {/* First dividing line */}
        <NavLink to="/missing-receipts" icon={<FileX className="h-5 w-5" />} label="Missing Receipts" />
        <NavLink to="/completed-receipts" icon={<Archive className="h-5 w-5" />} label="Completed Receipts" />
        {currentRole === 'admin' && (
          <>
            <div className="h-px bg-dyad-blue my-4" /> {/* Second dividing line */}
            <NavLink to="/admin/users" icon={<Users className="h-5 w-5" />} label="User Management" />
            <NavLink to="/admin/upload-transactions" icon={<Upload className="h-5 w-5" />} label="Upload Transactions" />
            <NavLink to="/admin/test-email" icon={<Mail className="h-5 w-5" />} label="Test Email" />
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
            <div className="text-xs text-muted-foreground">Role: {currentRole || 'Not available'}</div>
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
}

const NavLink = ({ to, icon, label }: NavLinkProps) => {
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
      <Link to={to}>
        {icon}
        <span className="ml-2">{label}</span>
      </Link>
    </Button>
  );
};

export default Sidebar;