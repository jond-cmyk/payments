"use client";

import React from 'react';
import { useSession } from '@/integrations/supabase/SessionContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Profile } from '@/types/supabase';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';

const UserManagement = () => {
  const { session, isLoading: isSessionLoading, user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  console.log("UserManagement: Session Loading:", isSessionLoading);
  console.log("UserManagement: Current User:", user);

  // Fetch current user's role
  const { data: profileData, isLoading: isProfileLoading, error: profileError } = useQuery<Profile | null>({
    queryKey: ['userProfile', user?.id],
    queryFn: async () => {
      console.log("UserManagement: Attempting to fetch user profile for ID:", user?.id);
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (error) {
        console.error("UserManagement: Error fetching user profile:", error);
        throw error;
      }
      console.log("UserManagement: Fetched profile data:", data);
      return data;
    },
    enabled: !!user?.id, // Only run query if user ID is available
    staleTime: 0, // Always refetch on mount for this critical check
  });

  // Determine if the current user is an admin
  const isAdmin = profileData?.role === 'admin';
  console.log("UserManagement: Is Admin:", isAdmin);

  // Fetch all user profiles, including their email from auth.users
  const { data: profiles, isLoading: isProfilesLoading, error: profilesError } = useQuery<Profile[]>({
    queryKey: ['allProfiles'],
    queryFn: async () => {
      console.log("UserManagement: Attempting to fetch all profiles (admin view)");
      const { data, error } = await supabase
        .from('profiles')
        .select('*, auth_users:auth.users(email)') // Select all profile fields and alias auth.users(email) as auth_users
        .order('first_name', { ascending: true });
      if (error) {
        console.error("UserManagement: Error fetching all profiles:", error);
        throw error;
      }
      console.log("UserManagement: Fetched all profiles:", data);
      return data;
    },
    enabled: isAdmin, // Only fetch if current user is confirmed admin
  });

  // Mutation for updating user role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Profile['role'] }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allProfiles'] });
      showSuccess("User role updated successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update user role.");
      console.error("Update role error:", error);
    },
  });

  const handleRoleChange = async (profileId: string, newRole: Profile['role']) => {
    const toastId = showLoading("Updating user role...");
    try {
      await updateRoleMutation.mutateAsync({ id: profileId, role: newRole });
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };

  // --- Centralized Loading and Access Control ---
  if (isSessionLoading || isProfileLoading) {
    console.log("UserManagement: Displaying initial loading state.");
    return <div className="flex items-center justify-center h-full text-lg">Loading user management...</div>;
  }

  if (!session) {
    console.log("UserManagement: No session found, redirecting to login.");
    navigate('/login');
    return null;
  }

  if (profileError) {
    console.error("UserManagement: Profile error detected, redirecting to dashboard.", profileError);
    showError("Error loading your profile. Please try again.");
    navigate('/dashboard');
    return null;
  }

  if (!profileData) {
    console.warn("UserManagement: No profile data found for user, redirecting to dashboard.");
    showError("Your user profile could not be loaded. Please contact support.");
    navigate('/dashboard');
    return null;
  }

  if (!isAdmin) {
    console.warn("UserManagement: User is not an admin, redirecting to dashboard. Role:", profileData.role);
    showError("You do not have permission to view this page.");
    navigate('/dashboard');
    return null;
  }

  // If we reach here, the user is authenticated and confirmed as an admin.
  if (isProfilesLoading) {
    console.log("UserManagement: Displaying profiles loading state.");
    return <div className="flex items-center justify-center h-full text-lg">Loading user profiles...</div>;
  }

  if (profilesError) {
    console.error("UserManagement: Error loading all profiles:", profilesError);
    return <div className="flex items-center justify-center h-full text-red-500">Error loading profiles: {profilesError.message}</div>;
  }

  console.log("UserManagement: Rendering content for admin.");
  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <Users className="mr-2 h-6 w-6" /> User Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profiles && profiles.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email Address</TableHead> {/* Changed from User ID */}
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">
                        {profile.first_name || ''} {profile.last_name || ''}
                      </TableCell>
                      <TableCell>{profile.auth_users?.email || 'N/A'}</TableCell> {/* Display email */}
                      <TableCell>
                        <Badge
                          className={
                            profile.role === 'admin'
                              ? 'bg-purple-500 text-purple-50'
                              : 'bg-gray-500 text-gray-50'
                          }
                        >
                          {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Select
                          value={profile.role}
                          onValueChange={(newRole: Profile['role']) => handleRoleChange(profile.id, newRole)}
                          disabled={updateRoleMutation.isPending || profile.id === user?.id} // Prevent changing own role via this interface
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Change Role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="requester">Requester</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground mt-8">No user profiles found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserManagement;