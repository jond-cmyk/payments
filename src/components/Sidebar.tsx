"use client";

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { Home, PlusCircle, List, LogOut, User, Users } from 'lucide-react'; // Import Users icon
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Profile } from '@/types/supabase';

const Sidebar = () => {
  const { session, user, isLoading } = useSession();
  const navigate = useNavigate();

  console.log('Sidebar: useSession - isLoading:', isLoading, 'user:', user);

  // Fetch user role using react-query
  const { data: profileData, isLoading: isProfileLoading, error: profileError } = useQuery<Profile | null>({
    queryKey: ['userProfile', user?.id],
    queryFn: async () => {
      console.log('Sidebar: useQuery - fetching for user ID:', user?.id);
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
      console.log('Sidebar: useQuery - fetched profile data:', data);
      return data;
    },
    enabled: !!user?.id, // Only run query if user ID is available
  });

  const currentRole = profileData?.role;
  console.log('Sidebar: isProfileLoading:', isProfileLoading, 'currentRole derived from profileData:', currentRole);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (isLoading || isProfileLoading) {
    return null; // Or a loading spinner for the sidebar
  }

  return (
    <div className="flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border p-4 shadow-md">
      <div className="flex items-center justify-center h-16 border-b border-sidebar-border mb-6">
        <h1 className="text-2xl font-bold text-dyad-blue">Payment App</h1>
      </div>
      <nav className="flex-1 space-y-2">
        <NavLink to="/dashboard" icon={<Home className="h-5 w-5" />} label="Dashboard" />
        {currentRole === 'requester' && (
          <NavLink to="/new-request" icon={<PlusCircle className="h-5 w-5" />} label="New Request" />
        )}
        {currentRole === 'admin' && (
          <>
            <NavLink to="/admin/requests" icon={<List className="h-5 w-5" />} label="All Requests" />
            <NavLink to="/admin/users" icon={<Users className="h-5 w-5" />} label="User Management" /> {/* New admin link */}
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
  return (
    <Button asChild variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
      <Link to={to}>
        {icon}
        <span className="ml-2">{label}</span>
      </Link>
    </Button>
  );
};

export default Sidebar;