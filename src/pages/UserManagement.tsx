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
import { Users, CheckCircle, XCircle } from 'lucide-react'; // Added CheckCircle and XCircle icons
import { Button } from '@/components/ui/button'; // Import Button

const UserManagement = () => {
  const { session, isLoading: isSessionLoading, user, userProfile: currentUserProfile } = useSession(); // Use userProfile from context
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Determine if the current user is an admin
  const isAdmin = currentUserProfile?.role === 'admin';

  // Fetch all user profiles, including their email from the new view
  const { data: profiles, isLoading: isProfilesLoading, error: profilesError } = useQuery<Profile[]>({
    queryKey: ['allProfiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_with_email') // Query the new view
        .select('*') // Select all columns from the view
        .order('first_name', { ascending: true });
      if (error) {
        console.error("UserManagement: Error fetching all profiles:", error);
        throw error;
      }
      return data;
    },
    enabled: isAdmin, // Only fetch if current user is confirmed admin
  });

  // Mutation for updating user role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Profile['role'] }) => {
      const { error } = await supabase
        .from('profiles') // Update the base profiles table
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

  // Mutation for updating user approval status
  const updateApprovalMutation = useMutation({
    mutationFn: async ({ id, is_approved }: { id: string; is_approved: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_approved, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allProfiles'] });
      showSuccess("User approval status updated successfully!");
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update user approval status.");
      console.error("Update approval error:", error);
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

  const handleApprovalToggle = async (profileId: string, currentApprovalStatus: boolean) => {
    const toastId = showLoading(currentApprovalStatus ? "Disapproving user..." : "Approving user...");
    try {
      await updateApprovalMutation.mutateAsync({ id: profileId, is_approved: !currentApprovalStatus });
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };

  // --- Centralized Loading and Access Control ---
  if (isSessionLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading user management...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (!currentUserProfile) {
    showError("Your user profile could not be loaded. Please contact support.");
    navigate('/dashboard');
    return null;
  }

  if (!isAdmin) {
    showError("You do not have permission to view this page.");
    navigate('/dashboard');
    return null;
  }

  // If we reach here, the user is authenticated and confirmed as an admin.
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
                    <TableHead>Email Address</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Approved</TableHead> {/* New column */}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">
                        {profile.first_name || ''} {profile.last_name || ''}
                      </TableCell>
                      <TableCell>{profile.user_email || 'N/A'}</TableCell>
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
                      <TableCell>
                        {profile.is_approved ? (
                          <Badge className="bg-green-500 text-green-50">
                            <CheckCircle className="mr-1 h-3 w-3" /> Approved
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500 text-red-50">
                            <XCircle className="mr-1 h-3 w-3" /> Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right flex items-center justify-end space-x-2">
                        <Select
                          value={profile.role}
                          onValueChange={(newRole: Profile['role']) => handleRoleChange(profile.id, newRole)}
                          disabled={updateRoleMutation.isPending || profile.id === user?.id} // Prevent changing own role via this interface
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Change Role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="requester">Requester</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant={profile.is_approved ? "destructive" : "default"}
                          size="sm"
                          onClick={() => handleApprovalToggle(profile.id, profile.is_approved)}
                          disabled={updateApprovalMutation.isPending || profile.id === user?.id} // Prevent changing own approval status
                        >
                          {profile.is_approved ? "Disapprove" : "Approve"}
                        </Button>
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