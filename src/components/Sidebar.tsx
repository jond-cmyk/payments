"use client";

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom'; // Import useLocation
import { Button } from '@/components/ui/button';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { Home, PlusCircle, List, LogOut, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Profile } from '@/types/supabase';

interface SidebarProps {
  className?: string;
  isMobile?: boolean; // New prop to adjust styling for mobile sheet
}

const Sidebar = ({ className, isMobile = false }: SidebarProps) => {
  const { session, user, isLoading } = useSession();
  const navigate = useNavigate();

  // Fetch user role using react-query
  const { data: profileData, isLoading: isProfileLoading } = useQuery<Profile | null>({
    queryKey: ['userProfile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (error) {
        console.error('Sidebar: Error fetching user role:', error.message);
        throw error;
      }
      return data;
    },
    enabled: !!user?.id, // Only run query if user ID is available
  });

  const currentRole = profileData?.role;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (isLoading || isProfileLoading) {
    return null; // Or a loading spinner for the sidebar
  }

  return (
    <div className={cn(
      "flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-md",
      isMobile ? "p-4" : "p-4", // Apply padding based on isMobile, currently same but can be differentiated
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
        {currentRole === 'admin' && (
          <>
            <NavLink to="/admin/requests" icon={<List className="h-5 w-5" />} label="All Requests" />
            <NavLink to="/admin/users" icon={<Users className="h-5 w-5" />} label="User Management" />
          </>
        )}
      </nav>
      <div className="mt-auto pt-4 border-t border-sidebar-border">
        {session && user ? (
          <div className="flex flex-col items-start space-y-2">
            <div className="flex items-center space-x-2 text-sm">
              <User className="h-4 w-4" />
              <span>{user.email}</span>
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
  const location = useLocation(); // Get current location
  const isActive = location.pathname === to; // Check if the link is active

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