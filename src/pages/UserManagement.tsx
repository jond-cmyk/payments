"use client";

import React, { useState } from 'react';
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
import { Users, CheckCircle, XCircle, UserPlus, Trash2 } from 'lucide-react'; // Import Trash2 icon
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"; // Import AlertDialog components
import AddUserForm from '@/components/user-management/AddUserForm';

const UserManagement = () => {
  const { session, isLoading: isSessionLoading, user, userProfile: currentUserProfile } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);

  const isAdmin = currentUserProfile?.role === 'admin';

  const { data: profiles, isLoading: isProfilesLoading, error: profilesError } = useQuery<Profile[]>({
    queryKey: ['allProfiles'],
    queryFn: async () => {
      console.log("UserManagement: Fetching all profiles..."); // Debug log
      const { data, error } = await supabase
        .from('profile_with_email')
        .select('*')
        .order('first_name', { ascending: true });
      if (error) {
        console.error("UserManagement: Error fetching all profiles:", error);
        throw error;
      }
      console.log("UserManagement: Fetched profiles:", data); // Debug log
      return data;
    },
    enabled: isAdmin,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Profile['role'] }) => {
      console.log(`UserManagement: Attempting to update role for user ${id} to ${role}`); // New log
      const { error } = await supabase
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        console.error(`UserManagement: Error updating role for user ${id}:`, error); // New log
        throw error;
      }
      console.log(`UserManagement: Role updated successfully for user ${id}.`); // New log
      return true;
    },
    onSuccess: async () => {
      showSuccess("User role updated successfully!");
      console.log("UserManagement: Role updated. Invalidating 'allProfiles' query."); // Debug log
      await queryClient.invalidateQueries({ queryKey: ['allProfiles'] }); // Changed to invalidate
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update user role.");
      console.error("UserManagement: Update role error:", error);
    },
  });

  const updateApprovalMutation = useMutation({
    mutationFn: async ({ id, is_approved }: { id: string; is_approved: boolean }) => {
      console.log(`UserManagement: Attempting to update approval status for user ${id} to ${is_approved}`); // New log
      const { error } = await supabase
        .from('profiles')
        .update({ is_approved, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        console.error(`UserManagement: Error updating approval status for user ${id}:`, error); // New log
        throw error;
      }
      console.log(`UserManagement: Approval status updated successfully for user ${id}.`); // New log
      return true;
    },
    onSuccess: async () => {
      showSuccess("User approval status updated successfully!");
      console.log("UserManagement: Approval status updated. Invalidating 'allProfiles' query."); // Debug log
      await queryClient.invalidateQueries({ queryKey: ['allProfiles'] }); // Changed to invalidate
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update user approval status.");
      console.error("UserManagement: Update approval error:", error);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      console.log(`UserManagement: Attempting to delete user ${userId} via Edge Function.`);
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId },
      });

      if (error) {
        console.error(`UserManagement: Error invoking delete-user Edge Function for user ${userId}:`, error);
        throw error;
      }

      if (data?.error) {
        console.error(`UserManagement: Edge Function reported error for user ${userId}:`, data.error);
        throw new Error(data.error);
      }

      console.log(`UserManagement: User ${userId} deleted successfully via Edge Function.`);
      return true;
    },
    onSuccess: async () => {
      showSuccess("User deleted successfully!");
      console.log("UserManagement: User deleted. Invalidating 'allProfiles' query.");
      await queryClient.invalidateQueries({ queryKey: ['allProfiles'] });
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete user.");
      console.error("UserManagement: Delete user error:", error);
    },
  });

  const handleRoleChange = async (profileId: string, newRole: Profile['role']) => {
    console.log(`UserManagement: handleRoleChange called for profile ${profileId}, new role: ${newRole}`); // New log
    const toastId = showLoading("Updating user role...");
    try {
      await updateRoleMutation.mutateAsync({ id: profileId, role: newRole });
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };

  const handleApprovalToggle = async (profileId: string, currentApprovalStatus: boolean) => {
    console.log(`UserManagement: handleApprovalToggle called for profile ${profileId}, current status: ${currentApprovalStatus}`); // New log
    const toastId = showLoading(currentApprovalStatus ? "Disapproving user..." : "Approving user...");
    try {
      await updateApprovalMutation.mutateAsync({ id: profileId, is_approved: !currentApprovalStatus });
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const toastId = showLoading("Deleting user...");
    try {
      await deleteUserMutation.mutateAsync(userId);
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };

  const handleUserAdded = () => {
    setIsAddUserDialogOpen(false);
    console.log("UserManagement: User added, invalidating 'allProfiles' query."); // New log
    queryClient.invalidateQueries({ queryKey: ['allProfiles'] });
  };

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

  if (isProfilesLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading user profiles...</div>;
  }

  if (profilesError) {
    return <div className="flex items-center justify-center h-full text-red-500">Error loading profiles: {profilesError.message}</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <CardTitle className="flex items-center text-2xl font-bold">
          <Users className="mr-2 h-6 w-6" /> User Management
        </CardTitle>
        <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" /> Add New User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>
            <AddUserForm onUserAdded={handleUserAdded} />
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardContent className="pt-6">
          {profiles && profiles.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email Address</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Approved</TableHead>
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
                          disabled={updateRoleMutation.isPending || profile.id === user?.id}
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
                          disabled={updateApprovalMutation.isPending || profile.id === user?.id}
                        >
                          {profile.is_approved ? "Disapprove" : "Approve"}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-500 border-red-500 hover:bg-red-50"
                              disabled={deleteUserMutation.isPending || profile.id === user?.id} // Disable if deleting or if it's the current user
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the user account for <strong>{profile.first_name || profile.user_email || 'this user'} {profile.last_name || ''}</strong> and remove their data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteUser(profile.id)} asChild>
                                <Button variant="destructive">
                                  Delete User
                                </Button>
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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