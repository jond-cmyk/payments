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
  const { session, isLoading, user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch current user's role
  const { data: profileData, isLoading: isProfileLoading, error: profileError } = useQuery<Profile | null>({
    queryKey: ['userProfile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 0, // Always refetch on mount for this critical check
  });

  // Fetch all user profiles
  const { data: profiles, isLoading: isProfilesLoading, error: profilesError } = useQuery<Profile[]>({
    queryKey: ['allProfiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('first_name', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!profileData && profileData.role === 'admin', // Only fetch if current user is confirmed admin
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
  if (isLoading || isProfileLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading user management...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  // After session and profile loading, check role
  if (profileError || !profileData || profileData.role !== 'admin') {
    // If there's an error fetching profile, or no profile data, or not an admin
    showError("You do not have permission to view this page.");
    navigate('/dashboard');
    return null; // Prevent rendering anything else
  }

  // Now we are sure the user is an admin and profileData is available
  const userRole = profileData.role; // Use profileData.role directly

  if (isProfilesLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading user profiles...</div>;
  }

  if (profilesError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading profiles: {profilesError.message}</div>;
  }

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
                    <TableHead>User ID</TableHead> {/* Changed from Email to User ID */}
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
                      <TableCell>{profile.id}</TableCell> {/* Displaying ID as it's the unique identifier */}
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