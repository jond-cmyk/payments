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
import { Badge } from '@/components/ui/badge';
import { Users, CheckCircle, XCircle, UserPlus, Trash2, Edit } from 'lucide-react'; // Import Edit icon
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
} from "@/components/ui/alert-dialog";
import AddUserForm from '@/components/user-management/AddUserForm';
import EditUserForm from '@/components/user-management/EditUserForm'; // Import the new EditUserForm

const UserManagement = () => {
  const { session, isLoading: isSessionLoading, user, userProfile: currentUserProfile } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);

  const isAdmin = currentUserProfile?.role === 'admin';

  const { data: profiles, isLoading: isProfilesLoading, error: profilesError } = useQuery<Profile[]>({
    queryKey: ['allProfiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile_with_email')
        .select('*')
        .order('first_name', { ascending: true });
      if (error) {
        throw error;
      }
      return data;
    },
    enabled: isAdmin,
  });

  const updateUserProfileMutation = useMutation({
    mutationFn: async (updatedFields: Partial<Profile> & { id: string }) => {
      const { id, ...fieldsToUpdate } = updatedFields;
      const { error } = await supabase
        .from('profiles')
        .update({ ...fieldsToUpdate, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        throw error;
      }
      return true;
    },
    onSuccess: async () => {
      showSuccess("User profile updated successfully!");
      await queryClient.invalidateQueries({ queryKey: ['allProfiles'] });
      setIsEditDialogOpen(false); // Close dialog on success
      setEditingUser(null);
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update user profile.");
      console.error("Update user profile error:", error);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return true;
    },
    onSuccess: async () => {
      showSuccess("User deleted successfully!");
      await queryClient.invalidateQueries({ queryKey: ['allProfiles'] });
    },
    onError: (error: any) => {
      showError(error.message || "Failed to delete user.");
      console.error("Delete user error:", error);
    },
  });

  const handleUserAdded = () => {
    setIsAddUserDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ['allProfiles'] });
  };

  const handleEditClick = (profile: Profile) => {
    setEditingUser(profile);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async (values: { first_name?: string; last_name?: string; role: Profile['role']; is_approved: boolean }) => {
    if (!editingUser) return;
    const toastId = showLoading("Saving user changes...");
    try {
      await updateUserProfileMutation.mutateAsync({ id: editingUser.id, ...values });
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
            <Button className="shadow-sm"> {/* Added shadow-sm */}
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
      <Card className="shadow-sm"> {/* Added shadow-sm */}
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
                    <TableRow key={profile.id} className="hover:bg-gradient-to-r hover:from-dyad-blue-light/5 hover:to-background"> {/* Added hover effect */}
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditClick(profile)}
                          disabled={updateUserProfileMutation.isPending}
                          className="shadow-sm" // Added shadow-sm
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-500 border-red-500 hover:bg-red-50 shadow-sm" // Added shadow-sm
                              disabled={deleteUserMutation.isPending || profile.id === user?.id}
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

      {editingUser && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit User: {editingUser.first_name || editingUser.user_email || 'N/A'}</DialogTitle>
            </DialogHeader>
            <EditUserForm
              profile={editingUser}
              currentUser={user}
              onSave={handleSaveEdit}
              isSaving={updateUserProfileMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default UserManagement;