"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/integrations/supabase/SessionContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { showSuccess, showError, showLoading, dismissToast } from '@/utils/toast';
import { User as UserIcon, Trash2 } from 'lucide-react'; // Import Trash2
import * as z from 'zod'; // Import z for schema type

import PageTitle from '@/components/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import ProfileForm from '@/components/profile/ProfileForm'; // Import the new ProfileForm
import { Button } from '@/components/ui/button'; // Import Button
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

// Zod schema for profile form (re-defined here for page-level type safety)
const profileFormSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

const ProfilePage = () => {
  const { session, isLoading: isSessionLoading, user, userProfile } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const updateUserProfileMutation = useMutation({
    mutationFn: async (updatedFields: z.infer<typeof profileFormSchema>) => {
      if (!user?.id) throw new Error("User not authenticated.");

      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: updatedFields.first_name || null,
          last_name: updatedFields.last_name || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      
      if (error) throw error;
      return true;
    },
    onSuccess: async () => {
      showSuccess("Profile updated successfully!");
      // Invalidate the userProfile query to refetch the updated user profile
      await queryClient.invalidateQueries({ queryKey: ['userProfile', user?.id] }); // CHANGED HERE
    },
    onError: (error: any) => {
      showError(error.message || "Failed to update profile.");
      console.error("Update profile error:", error);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not authenticated.");
      
      const toastId = showLoading("Deleting account...");

      try {
        // Use the Edge Function to delete the user (which handles auth.users and cascades to public.profiles)
        const { data, error: invokeError } = await supabase.functions.invoke('delete-user', {
          body: { userId: user.id },
        });

        if (invokeError) {
          throw new Error(invokeError.message);
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        dismissToast(toastId);
        showSuccess("Your account has been successfully deleted.");
        // Force sign out and navigation handled by SessionContext listener
        await supabase.auth.signOut();
        navigate('/login');
        return true;
      } catch (error: any) {
        dismissToast(toastId);
        showError(error.message || "Failed to delete account.");
        console.error("Delete account error:", error);
        throw error;
      }
    },
    // No onSuccess needed here as navigation is handled inside mutationFn after successful Edge Function call
    onError: (error: any) => {
      // Error handling is done inside mutationFn
    },
  });

  const handleSaveProfile = async (values: z.infer<typeof profileFormSchema>) => {
    const toastId = showLoading("Saving profile changes...");
    try {
      await updateUserProfileMutation.mutateAsync(values);
      dismissToast(toastId);
    } catch (error) {
      dismissToast(toastId);
    }
  };

  if (isSessionLoading) {
    return <div className="flex items-center justify-center h-full text-lg">Loading profile...</div>;
  }

  if (!session) {
    navigate('/login');
    return null;
  }

  if (!userProfile) {
    return <div className="flex items-center justify-center h-full text-red-500">Error: User profile not found.</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <PageTitle title="My Profile - KH Payments" />
      <Card className="max-w-2xl mx-auto shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center text-2xl font-bold">
            <UserIcon className="mr-2 h-6 w-6" /> My Profile
          </CardTitle>
          <CardDescription>
            View and update your personal information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 text-center">
            {/* Future: Avatar display */}
            {/* {userProfile.avatar_url ? (
              <img src={userProfile.avatar_url} alt="User Avatar" className="w-24 h-24 rounded-full mx-auto mb-4 object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-4">
                <UserIcon className="h-12 w-12 text-gray-500" />
              </div>
            )} */}
            <p className="text-lg font-semibold">{userProfile.first_name || ''} {userProfile.last_name || ''}</p>
            <p className="text-muted-foreground">{user?.email}</p>
            <p className="text-muted-foreground">Role: {userProfile.role?.charAt(0).toUpperCase() + userProfile.role?.slice(1)}</p>
            <p className="text-muted-foreground">Country: {userProfile.country || 'N/A'}</p>
          </div>
          <ProfileForm
            profile={userProfile}
            currentUser={user}
            onSave={handleSaveProfile}
            isSaving={updateUserProfileMutation.isPending}
          />
        </CardContent>
      </Card>

      {/* GDPR: Right to Erasure - Delete Account */}
      <Card className="max-w-2xl mx-auto shadow-sm mt-8 border-l-4 border-red-500">
        <CardHeader>
          <CardTitle className="flex items-center text-xl font-bold text-red-700">
            <Trash2 className="mr-2 h-5 w-5" /> Delete Account
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive" 
                className="w-full"
                disabled={deleteAccountMutation.isPending}
              >
                {deleteAccountMutation.isPending ? "Processing Deletion..." : "Request Account Deletion"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action will permanently delete your user account, profile, and all associated data (payment requests, transactions, etc.). This is irreversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteAccountMutation.mutate()} asChild>
                  <Button variant="destructive">
                    Confirm Delete My Account
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;