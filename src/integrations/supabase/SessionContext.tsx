"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './client';
import { Profile } from '@/types/supabase'; // Import Profile type

interface SessionContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isApproved: boolean | null; // Add isApproved to context
  userProfile: Profile | null; // Add userProfile to context
}

// Create the context
const SessionContext = createContext<SessionContextType | undefined>(undefined);

// Function to fetch user profile
const fetchUserProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error("SessionContext: Error fetching user profile:", error);
    return null;
  }
  return data;
};

export const SessionContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start as true
  const [isApproved, setIsApproved] = useState<boolean | null>(null); // State for approval status
  const [userProfile, setUserProfile] = useState<Profile | null>(null); // State for full profile

  // Helper to determine combined approval status
  const getCombinedApprovalStatus = (authUser: User | null, profile: Profile | null): boolean => {
    const isEmailConfirmed = !!authUser?.email_confirmed_at;
    const isProfileApproved = profile?.is_approved ?? false;
    console.log(`[SessionContext] getCombinedApprovalStatus: authUser.email_confirmed_at=${authUser?.email_confirmed_at}, profile.is_approved=${profile?.is_approved}, Combined=${isEmailConfirmed && isProfileApproved}`);
    return isEmailConfirmed && isProfileApproved;
  };

  useEffect(() => {
    const loadSessionAndProfile = async () => {
      console.log("SessionContext: Starting initial session and profile load.");
      setIsLoading(true);

      const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("SessionContext: Error getting initial session:", sessionError);
        setSession(null);
        setUser(null);
        setUserProfile(null);
        setIsApproved(false);
      } else {
        setSession(initialSession);
        let authUser = initialSession?.user || null;
        
        // Explicitly fetch user to ensure latest email_confirmed_at
        if (authUser) {
          const { data: { user: freshUser }, error: userError } = await supabase.auth.getUser();
          if (userError) {
            console.error("SessionContext: Error fetching fresh user data:", userError);
          } else if (freshUser) {
            authUser = freshUser; // Use the freshest user data
          }
        }
        setUser(authUser);

        if (authUser) {
          const profile = await fetchUserProfile(authUser.id);
          setUserProfile(profile);
          setIsApproved(getCombinedApprovalStatus(authUser, profile));
          console.log("SessionContext: Initial profile loaded - Role:", profile?.role, "Country:", profile?.country, "Email Confirmed:", !!authUser.email_confirmed_at, "Profile Approved:", profile?.is_approved);
        } else {
          setUserProfile(null);
          setIsApproved(false);
        }
      }
      setIsLoading(false);
      console.log("SessionContext: Initial session and profile load complete. isLoading set to false.");
    };

    loadSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      console.log("SessionContext: Auth state changed (listener). Event:", _event, "Session:", currentSession);
      setSession(currentSession);
      // When auth state changes, the currentSession.user might not have the *absolute latest* email_confirmed_at
      // if it was changed by an admin. We need to re-fetch the user to be sure.
      // Setting user here will trigger the next useEffect.
      setUser(currentSession?.user || null); 
      if (!currentSession?.user) {
        setUserProfile(null);
        setIsApproved(false);
      }
    });

    return () => {
      console.log("SessionContext: Unsubscribing from auth state listener.");
      subscription.unsubscribe();
    };
  }, []);

  // Separate useEffect to update profile and approval status when user changes
  useEffect(() => {
    const updateProfileAndApproval = async () => {
      if (user) {
        // Fetch the freshest user data again to ensure email_confirmed_at is up-to-date
        const { data: { user: freshUser }, error: userError } = await supabase.auth.getUser();
        let authUser = user;
        if (userError) {
          console.error("SessionContext: Error fetching fresh user data in user-change effect:", userError);
        } else if (freshUser) {
          authUser = freshUser; // Use the freshest user data
        }

        const profile = await fetchUserProfile(authUser.id);
        setUserProfile(profile);
        setIsApproved(getCombinedApprovalStatus(authUser, profile)); // Use combined status with freshUser
        console.log("SessionContext: User changed, profile updated - Role:", profile?.role, "Country:", profile?.country, "Email Confirmed:", !!authUser.email_confirmed_at, "Profile Approved:", profile?.is_approved);
      } else {
        setUserProfile(null);
        setIsApproved(false);
      }
    };
    if (!isLoading) { // Only run if initial loading is complete
      updateProfileAndApproval();
    }
  }, [user, isLoading]); // Depend on user and isLoading

  return (
    <SessionContext.Provider value={{ session, user, isLoading, isApproved, userProfile }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionContextProvider');
  }
  return context;
};